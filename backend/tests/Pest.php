<?php

use App\Models\User;
use App\Notifications\SetInitialPassword;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

pest()->extend(TestCase::class)->in('Feature');

/**
 * Parámetros (email, token) del último enlace de configuración enviado por correo a la cuenta.
 * Requiere Notification::fake(): el enlace nunca viaja en las respuestas HTTP con entrega por correo.
 */
function sentSetupLinkQuery(User $user): array
{
    $notification = Notification::sent($user, SetInitialPassword::class)->last();
    expect($notification)->not->toBeNull();
    parse_str(parse_url($notification->setupUrl, PHP_URL_QUERY), $query);

    return $query;
}
