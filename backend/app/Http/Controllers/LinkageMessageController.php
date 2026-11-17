<?php

namespace App\Http\Controllers;

use App\Enums\LinkageParty;
use App\Enums\LinkageRequestStatus;
use App\Http\Requests\ListLinkageMessagesRequest;
use App\Http\Requests\MarkLinkageMessagesReadRequest;
use App\Http\Requests\StoreLinkageMessageRequest;
use App\Jobs\NotifyLinkageMessage;
use App\Models\LinkageMessage;
use App\Models\LinkageRequest;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Conversación de una solicitud de vinculación aceptada (HU-S13-01), compartida por las rutas de la empresa y de la
 * institución. El lado lo fija la sesión: cada consulta se acota a la organización de la cuenta, y una solicitud ajena
 * responde 404 idéntico a una inexistente. El otro lado solo conoce la organización que escribió, nunca la cuenta.
 */
class LinkageMessageController extends Controller
{
    private const PER_PAGE = 100;

    private const NOT_ACCEPTED = 'La conversación solo está disponible en solicitudes aceptadas.';

    private const READ_ONLY = 'La conversación es de solo lectura: la otra organización ya no está activa.';

    /** CA-06: mensajes en orden cronológico, de 100 en 100, con after=<id> para la consulta incremental. */
    public function index(ListLinkageMessagesRequest $request, string $linkageRequest): JsonResponse
    {
        $party = LinkageParty::of($request->user()->role);
        $linkage = $this->conversation($request, $linkageRequest);

        $messages = $linkage->messages()
            ->where('id', '>', (int) ($request->validated('after') ?? 0))
            ->with('sender:id,name')
            ->orderBy('id')
            ->limit(self::PER_PAGE + 1)
            ->get();

        return response()->json([
            'data' => $messages->take(self::PER_PAGE)->map(fn (LinkageMessage $message): array => $this->item($message, $linkage, $party))->values(),
            'meta' => [
                'has_more' => $messages->count() > self::PER_PAGE,
                'can_write' => $this->counterpartActive($linkage, $party),
                'last_read_message_id' => $linkage->getAttribute($party->readMarkerColumn()),
            ],
        ])->header('Cache-Control', 'no-store, private');
    }

    /**
     * CA-05, CA-07: el mensaje queda a nombre de la cuenta y del lado de la sesión. Enviar deja leído para ese lado
     * todo lo anterior. La fila de la solicitud se bloquea para que los marcadores avancen en orden.
     */
    public function store(StoreLinkageMessageRequest $request, string $linkageRequest): JsonResponse
    {
        $user = $request->user();
        $party = LinkageParty::of($user->role);

        [$message, $linkage] = DB::transaction(function () use ($request, $linkageRequest, $user, $party): array {
            $linkage = $this->conversation($request, $linkageRequest, lock: true);

            if (! $this->counterpartActive($linkage, $party)) {
                throw ValidationException::withMessages(['status' => [self::READ_ONLY]]);
            }

            $message = new LinkageMessage(['body' => $request->validated('body')]);
            $message->linkage_request_id = $linkage->id;
            $message->sender_party = $party;
            $message->sender_user_id = $user->id;
            $message->save();

            // Sin tocar updated_at: un mensaje no modifica la solicitud. Quien escribe ya leyó lo anterior, así que su
            // ventana de avisos por correo se reinicia (HU-S13-05).
            LinkageRequest::query()->whereKey($linkage->id)->toBase()->update([
                'last_message_at' => $message->created_at,
                $party->readMarkerColumn() => $message->id,
                $party->notifiedAtColumn() => null,
            ]);

            // HU-S13-05 CA-01: aviso por correo al otro lado si en unos minutos sigue sin leerlo. La cola lo entrega
            // después del commit (after_commit).
            NotifyLinkageMessage::dispatch($linkage->id, $party->counterpart(), $message->id)
                ->delay(now()->addMinutes(NotifyLinkageMessage::DELAY_MINUTES));

            return [$message->setRelation('sender', $user), $linkage];
        });

        return response()->json(['data' => $this->item($message, $linkage, $party)], 201)
            ->header('Cache-Control', 'no-store, private');
    }

    /** CA-08: el marcador es del lado de la sesión, solo avanza y solo admite mensajes de esta conversación. */
    public function read(MarkLinkageMessagesReadRequest $request, string $linkageRequest): JsonResponse
    {
        $party = LinkageParty::of($request->user()->role);
        $messageId = (int) $request->validated('last_read_message_id');

        $marker = DB::transaction(function () use ($request, $linkageRequest, $party, $messageId): int {
            $linkage = $this->conversation($request, $linkageRequest, lock: true);

            if (! $linkage->messages()->whereKey($messageId)->exists()) {
                throw ValidationException::withMessages(['last_read_message_id' => ['El mensaje no pertenece a esta conversación.']]);
            }

            $column = $party->readMarkerColumn();
            $current = $linkage->getAttribute($column);
            if ($current !== null && $current >= $messageId) {
                return $current;
            }
            // HU-S13-05: al leer, la ventana de avisos del lado se reinicia y el siguiente mensaje vuelve a avisar.
            LinkageRequest::query()->whereKey($linkage->id)->toBase()->update([$column => $messageId, $party->notifiedAtColumn() => null]);

            return $messageId;
        });

        return response()->json(['data' => ['last_read_message_id' => $marker]])->header('Cache-Control', 'no-store, private');
    }

    /**
     * HU-S13-04 CA-02: cuántas conversaciones de la organización de la sesión tienen mensajes del otro lado sin leer,
     * para el aviso del menú. Una sola consulta acotada a la organización.
     */
    public function summary(Request $request): JsonResponse
    {
        $party = LinkageParty::of($request->user()->role);
        $conversations = LinkageRequest::query()
            ->where($party->ownerColumn(), $this->ownerId($request))
            ->where('status', LinkageRequestStatus::ACCEPTED)
            ->withUnread($party)
            ->count();

        return response()->json(['data' => ['conversations' => $conversations]])->header('Cache-Control', 'no-store, private');
    }

    /** Organización de la sesión del lado que le corresponde. */
    private function ownerId(Request $request): ?int
    {
        $user = $request->user();

        return LinkageParty::of($user->role) === LinkageParty::COMPANY ? $user->company_id : $user->institution_id;
    }

    /** CA-03, CA-04: solicitud propia y ACEPTADA, con las dos organizaciones para nombrarlas y saber si siguen activas. */
    private function conversation(Request $request, string $linkageRequest, bool $lock = false): LinkageRequest
    {
        $party = LinkageParty::of($request->user()->role);

        $linkage = LinkageRequest::query()
            ->where($party->ownerColumn(), $this->ownerId($request))
            ->when($lock, fn ($query) => $query->lockForUpdate())
            ->find((int) $linkageRequest);
        abort_if($linkage === null, 404, 'La solicitud no existe.');

        if ($linkage->status !== LinkageRequestStatus::ACCEPTED) {
            throw ValidationException::withMessages(['status' => [self::NOT_ACCEPTED]]);
        }

        return $linkage->load(['company:id,legal_name,trade_name,is_active', 'institution:id,name,is_active']);
    }

    /** CA-05: la propia organización está activa (lo garantiza la sesión); la otra puede haberse inactivado. */
    private function counterpartActive(LinkageRequest $linkage, LinkageParty $party): bool
    {
        return $party === LinkageParty::COMPANY ? $linkage->institution->is_active : $linkage->company->is_active;
    }

    /** CA-06: lista explícita de campos. La cuenta solo se nombra en los mensajes del propio lado. */
    private function item(LinkageMessage $message, LinkageRequest $linkage, LinkageParty $party): array
    {
        $own = $message->sender_party === $party;

        return [
            'id' => $message->id,
            'sender_party' => $message->sender_party->value,
            'sender_name' => $message->sender_party === LinkageParty::COMPANY
                ? ($linkage->company->trade_name ?? $linkage->company->legal_name)
                : $linkage->institution->name,
            'is_own' => $own,
            'account_name' => $own ? $message->sender->name : null,
            'body' => $message->body,
            'created_at' => $message->created_at->toISOString(),
        ];
    }
}
