<?php

use App\Models\User;
use App\Notifications\AccessEmailChanged;
use App\Notifications\LinkageMessageReceived;
use App\Notifications\PasswordChanged;
use App\Notifications\ResetInstitutionPassword;
use App\Notifications\SetInitialPassword;
use Illuminate\Mail\Markdown;
use Illuminate\Notifications\Notification;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Notification as Notifications;

// T-S18-05: correos con la marca del Banco de Talentos, en español, con el logotipo por URL pública.

/** @return array<string, Closure(): Notification> */
function brandedMailSamples(): array
{
    return [
        'contraseña inicial' => fn () => new SetInitialPassword('https://piloto.example.test/set-initial-password?token=x'),
        'restablecimiento' => fn () => new ResetInstitutionPassword('https://piloto.example.test/reset-password?token=x'),
        'olvidé mi contraseña' => fn () => new ResetInstitutionPassword('https://piloto.example.test/reset-password?token=x', ResetInstitutionPassword::SELF_INITIATOR),
        'contraseña cambiada' => fn () => new PasswordChanged,
        'correo de acceso nuevo' => fn () => new AccessEmailChanged(false),
        'correo de acceso anterior' => fn () => new AccessEmailChanged(true),
        'mensaje de vinculación' => fn () => new LinkageMessageReceived('ManuGolfo', 'Tableros de producción', 'https://piloto.example.test/linkage-requests/1/chat'),
    ];
}

const ENGLISH_LEFTOVERS = ['Regards', 'Hello!', 'Whoops', 'having trouble', 'All rights reserved', 'Laravel'];

it('renders every mail in Spanish with the brand header, colors and footer', function (Closure $sample) {
    $html = (string) $sample()->toMail(new User(['name' => 'Ana López', 'email' => 'ana@example.test']))->render();

    expect($html)
        ->toContain('src="'.config('mail.logo_url').'"')
        ->toContain('alt="Nodologístico"')
        ->toContain('Educación Dual')
        ->toContain('#991B30')
        ->toContain('#B99058')
        ->toContain('Este correo se envió automáticamente desde la plataforma; no lo respondas.');
    foreach (ENGLISH_LEFTOVERS as $leftover) {
        expect($html)->not->toContain($leftover);
    }
})->with(brandedMailSamples());

it('translates the salutation and the button fallback of the framework template', function () {
    $html = (string) (new SetInitialPassword('https://piloto.example.test/set-initial-password?token=x'))
        ->toMail(new User(['name' => 'Ana López']))->render();

    expect($html)->toContain('Saludos,')
        ->toContain('Si el botón «Establecer contraseña» no funciona, copia y pega este enlace en tu navegador:');
});

it('renders the plain text version in Spanish with the same footer', function (Closure $sample) {
    $message = $sample()->toMail(new User(['name' => 'Ana López']));
    $text = (string) app(Markdown::class)->renderText('notifications::email', $message->data());

    expect($text)->toContain('Banco de Talentos – Educación Dual')
        ->toContain('Este correo se envió automáticamente desde la plataforma; no lo respondas.');
    foreach (ENGLISH_LEFTOVERS as $leftover) {
        expect($text)->not->toContain($leftover);
    }
})->with(brandedMailSamples());

it('serves the logo from the public path of the SPA, next to FRONTEND_URL', function () {
    // La SPA lo publica en frontend/public/brand/logo-correo.png (src/ui/favicon.test.ts verifica el archivo) y Caddy lo
    // sirve tal cual; una ruta distinta caería en el index.html de la SPA y la imagen se rompería sin un 404.
    expect(config('mail.logo_url'))->toBe(rtrim(config('app.frontend_url'), '/').'/brand/logo-correo.png');
    expect(config('mail.markdown.theme'))->toBe('banco-talentos');
    expect(File::exists(resource_path('views/vendor/mail/html/themes/banco-talentos.css')))->toBeTrue();
});

it('uses Spanish as the default locale even without APP_LOCALE', function () {
    expect(config('app.locale'))->toBe('es');
});

describe('mail:preview', function () {
    it('writes one HTML preview per mail and variant', function () {
        File::deleteDirectory(storage_path('app/mail-previews'));

        $this->artisan('mail:preview')->assertSuccessful();

        $files = collect(File::files(storage_path('app/mail-previews')))->map->getFilename()->sort()->values()->all();
        expect($files)->toBe([
            'contrasena-cambiada.html', 'contrasena-inicial.html', 'correo-de-acceso-anterior.html', 'correo-de-acceso-nuevo.html',
            'mensaje-de-vinculacion.html', 'restablecimiento-administracion.html', 'restablecimiento-olvide.html',
        ]);
        expect(File::get(storage_path('app/mail-previews/contrasena-inicial.html')))->toContain('Establecer contraseña');
    });

    it('sends every preview right away to the given address', function () {
        Notifications::fake();

        $this->artisan('mail:preview', ['--send' => 'revision@example.test'])->assertSuccessful();

        Notifications::assertSentTimes(SetInitialPassword::class, 1);
        Notifications::assertSentTimes(ResetInstitutionPassword::class, 2);
        Notifications::assertSentTimes(PasswordChanged::class, 1);
        Notifications::assertSentTimes(AccessEmailChanged::class, 2);
        Notifications::assertSentTimes(LinkageMessageReceived::class, 1);
    });

    it('rejects an invalid address without sending anything', function () {
        Notifications::fake();

        $this->artisan('mail:preview', ['--send' => 'no-es-un-correo'])->assertFailed();

        Notifications::assertNothingSent();
    });

    it('never runs in production', function () {
        Notifications::fake();
        $this->app['env'] = 'production';

        $this->artisan('mail:preview', ['--send' => 'revision@example.test'])->assertFailed();

        Notifications::assertNothingSent();
    });
});
