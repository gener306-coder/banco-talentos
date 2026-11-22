<?php

namespace App\Http\Controllers;

use App\Enums\SetupDeliveryMethod;
use App\Http\Requests\InviteInstitutionRequest;
use App\Http\Requests\UpdateInstitutionRequest;
use App\Http\Requests\UpdateInstitutionStatusRequest;
use App\Models\AccountAuditEvent;
use App\Models\Institution;
use App\Models\User;
use App\Services\InitialPasswordLink;
use App\Services\InstitutionAccounts;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class InstitutionController extends Controller
{
    private const PER_PAGE = 50;

    /**
     * HU-S16-05: listado paginado con búsqueda literal por nombre, CCT o correo de sus cuentas (% y _ no son comodines;
     * un campo en null no coincide). Las invitadas sin nombre van al final. Cada fila agrega el estado de su perfil.
     */
    public function index(Request $request): JsonResponse
    {
        $validated = $request->validate(
            ['q' => ['nullable', 'string', 'max:200']],
            ['q.string' => 'La búsqueda no es válida.', 'q.max' => 'La búsqueda no debe superar 200 caracteres.'],
        );
        $term = trim((string) ($validated['q'] ?? ''));
        $pattern = '%'.addcslashes(mb_strtolower($term), '\\%_').'%';

        $page = Institution::query()
            ->withExists(['users as accessed' => fn ($users) => $users->where('password_setup_required', false)])
            // Correo de la primera cuenta: identifica a la invitada mientras no captura su nombre.
            ->addSelect(['account_email' => User::query()->select('email')->whereColumn('users.institution_id', 'institutions.id')->orderBy('id')->limit(1)])
            ->when($term !== '', fn ($query) => $query->where(fn ($match) => $match
                ->whereRaw('lower(name) LIKE ?', [$pattern])
                ->orWhereRaw('lower(cct) LIKE ?', [$pattern])
                ->orWhereExists(fn ($account) => $account->selectRaw('1')->from('users')
                    ->whereColumn('users.institution_id', 'institutions.id')->whereRaw('lower(users.email) LIKE ?', [$pattern]))))
            ->orderByRaw('lower(name) ASC NULLS LAST')
            ->orderBy('id')
            ->paginate(self::PER_PAGE);

        return response()->json([
            'data' => $page->getCollection()->map(fn (Institution $institution): array => $this->summary($institution))->values(),
            'meta' => [
                'current_page' => $page->currentPage(),
                'last_page' => $page->lastPage(),
                'total' => $page->total(),
            ],
        ])->header('Cache-Control', 'no-store, private');
    }

    /** Fila del listado: los datos de la institución y el estado de su perfil (HU-S16-05). */
    private function summary(Institution $institution): array
    {
        $accessed = (bool) $institution->getAttribute('accessed');

        return [
            ...Arr::except($institution->toArray(), ['accessed', 'account_email']),
            'account_email' => $institution->getAttribute('account_email'),
            'profile_status' => $institution->profileStatus($accessed),
        ];
    }

    /**
     * HU-S16-06: la invitación crea la institución sin perfil (con el nombre de referencia, si llega) y la cuenta de su
     * persona en una transacción, y registra `institution_invited`. Sin nombre de la persona, la cuenta guarda el correo
     * como nombre provisional (M3). El contacto queda vacío hasta el onboarding (D5). Después del commit envía el enlace
     * por correo o, con la entrega manual (HU-S2-01), lo devuelve; con correo, el enlace nunca vuelve en la respuesta.
     */
    public function store(InviteInstitutionRequest $request, InstitutionAccounts $accounts, InitialPasswordLink $links): JsonResponse
    {
        $data = $request->validated();
        $method = SetupDeliveryMethod::from($data['delivery_method'] ?? SetupDeliveryMethod::EMAIL->value);
        $institution = new Institution(['name' => $data['name'] ?? null]);

        try {
            [$user, $setupUrl] = DB::transaction(function () use ($institution, $accounts, $request, $data): array {
                $this->saveDetails($institution);
                AccountAuditEvent::record($request->user(), AccountAuditEvent::INSTITUTION_INVITED, $institution);

                return $accounts->create($institution, $data['person_name'] ?? $data['email'], $data['email'], $request->user());
            });
        } catch (UniqueConstraintViolationException $exception) {
            // Dos registros simultáneos con el mismo correo: la restricción es la última garantía.
            if ($exception->index !== 'users_email_unique') {
                throw $exception;
            }
            throw ValidationException::withMessages(['email' => ['El correo ya está registrado en otra cuenta.']]);
        }

        return response()->json([
            ...$links->deliver($user, $setupUrl, $method, $request->user()->id),
            'data' => $institution,
        ], 201)->header('Cache-Control', 'no-store, private');
    }

    public function show(Institution $institution): JsonResponse
    {
        return response()->json(['data' => $institution]);
    }

    public function update(UpdateInstitutionRequest $request, Institution $institution): JsonResponse
    {
        $institution->fill($request->validated());
        // HU-S14-04 (D8): la edición de ADMIN queda en la bitácora con los nombres de los campos que cambiaron.
        $changed = array_values(array_diff(array_keys($institution->getDirty()), ['updated_at']));
        $this->saveDetails($institution, function () use ($request, $institution, $changed): void {
            if ($changed !== []) {
                AccountAuditEvent::record($request->user(), AccountAuditEvent::ORGANIZATION_PROFILE_UPDATED, $institution, $changed);
            }
        });

        return response()->json(['data' => $institution]);
    }

    public function updateStatus(UpdateInstitutionStatusRequest $request, Institution $institution): JsonResponse
    {
        $institution->is_active = $request->validated('is_active');
        $institution->save();

        return response()->json(['data' => $institution]);
    }

    /** `$after` corre en la misma transacción que el guardado (p. ej. el evento de la bitácora). */
    private function saveDetails(Institution $institution, ?callable $after = null): void
    {
        try {
            DB::transaction(function () use ($institution, $after): void {
                $institution->save();
                if ($after !== null) {
                    $after();
                }
            });
        } catch (UniqueConstraintViolationException $exception) {
            if ($exception->index !== 'institutions_cct_unique') {
                throw $exception;
            }

            // La restricción también cubre solicitudes concurrentes que superan
            // la validación de unicidad antes de que la otra solicitud escriba.
            throw ValidationException::withMessages([
                'cct' => ['La Clave de Centro de Trabajo ya está registrada.'],
            ]);
        }
    }
}
