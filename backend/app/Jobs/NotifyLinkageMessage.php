<?php

namespace App\Jobs;

use App\Enums\LinkageParty;
use App\Enums\LinkageRequestStatus;
use App\Models\LinkageRequest;
use App\Models\User;
use App\Notifications\LinkageMessageReceived;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Throwable;

/**
 * Aviso por correo de un mensaje sin leer (HU-S13-05). Se encola al enviar el mensaje con unos minutos de retraso y,
 * al ejecutarse, solo avisa si el lado receptor sigue sin leerlo y no recibió otro aviso de esa conversación en las
 * últimas 6 horas. El aviso se reclama con una sola actualización atómica: aunque lleguen varios mensajes (varios
 * trabajos), sale como máximo un correo por ventana.
 */
class NotifyLinkageMessage implements ShouldQueue
{
    use Queueable;

    /** Retraso del aviso: si el otro lado está conversando, lo lee antes y no recibe correo (CA-01). */
    public const DELAY_MINUTES = 5;

    /** Como máximo un aviso por conversación y lado en esta ventana mientras siga sin leer (CA-02). */
    public const THROTTLE_HOURS = 6;

    // Un correo que falla vuelve a intentarse; el aviso reclamado se libera antes de relanzar el error.
    public int $tries = 3;

    public int $backoff = 60;

    public function __construct(
        public readonly int $linkageRequestId,
        public readonly LinkageParty $recipient,
        public readonly int $messageId,
    ) {}

    public function handle(): void
    {
        $notified = $this->recipient->notifiedAtColumn();
        $previous = DB::table('linkage_requests')->where('id', $this->linkageRequestId)->value($notified);

        // CA-01, CA-02: sigue aceptada, el lado no ha leído este mensaje y no hubo aviso en la ventana.
        $claimed = DB::table('linkage_requests')
            ->where('id', $this->linkageRequestId)
            ->where('status', LinkageRequestStatus::ACCEPTED->value)
            ->whereRaw('COALESCE('.$this->recipient->readMarkerColumn().', 0) < ?', [$this->messageId])
            ->where(fn ($query) => $query->whereNull($notified)->orWhere($notified, '<=', now()->subHours(self::THROTTLE_HOURS)))
            ->update([$notified => now()]);
        if ($claimed === 0) {
            return;
        }

        $linkage = LinkageRequest::query()
            ->with(['company:id,legal_name,trade_name,is_active', 'institution:id,name,is_active', 'opportunity:id,title'])
            ->findOrFail($this->linkageRequestId);
        $organization = $this->recipient === LinkageParty::COMPANY ? $linkage->company : $linkage->institution;
        $recipients = User::query()
            ->where($this->recipient->ownerColumn(), $organization->id)
            ->where('role', $this->recipient->role()->value)
            ->where('is_active', true)
            ->where('password_setup_required', false)
            ->get();
        // Una organización inactiva no puede entrar a leerlo.
        if (! $organization->is_active || $recipients->isEmpty()) {
            return;
        }

        $sender = $this->recipient === LinkageParty::COMPANY
            ? $linkage->institution->name
            : ($linkage->company->trade_name ?? $linkage->company->legal_name);
        $path = $this->recipient === LinkageParty::COMPANY ? '/linkage-requests/' : '/institution/linkage-requests/';

        try {
            Notification::send($recipients, new LinkageMessageReceived(
                $sender,
                $linkage->opportunity->title,
                // HU-S13-06 CA-06: el correo lleva directo a la vista de la conversación.
                rtrim((string) config('app.frontend_url'), '/').$path.$linkage->id.'/chat',
            ));
        } catch (Throwable $error) {
            // El reintento debe poder reclamar el aviso de nuevo.
            DB::table('linkage_requests')->where('id', $this->linkageRequestId)->update([$notified => $previous]);
            throw $error;
        }
    }
}
