<?php

use App\Enums\UserRole;
use App\Http\Controllers\AccountController;
use App\Http\Controllers\AccountEmailController;
use App\Http\Controllers\AdminAccountController;
use App\Http\Controllers\AuditEventController;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\CompanyAccountController;
use App\Http\Controllers\CompanyController;
use App\Http\Controllers\DashboardController;
use App\Http\Controllers\InstitutionAccountController;
use App\Http\Controllers\InstitutionController;
use App\Http\Controllers\InstitutionLinkageRequestController;
use App\Http\Controllers\InstitutionPasswordResetController;
use App\Http\Controllers\InstitutionSetupLinkController;
use App\Http\Controllers\InstitutionVideoController;
use App\Http\Controllers\LinkageMessageController;
use App\Http\Controllers\LinkageRequestController;
use App\Http\Controllers\MediaController;
use App\Http\Controllers\MunicipalityController;
use App\Http\Controllers\OpportunityController;
use App\Http\Controllers\OrganizationProfileController;
use App\Http\Controllers\PromotionalVideoController;
use App\Http\Controllers\ReportController;
use App\Http\Controllers\SecretaryAccountController;
use App\Http\Controllers\SkillController;
use App\Http\Controllers\StudentController;
use App\Http\Controllers\StudentCvController;
use App\Http\Controllers\StudentDisclosureController;
use App\Http\Controllers\StudentSocialSecurityController;
use App\Http\Controllers\TalentController;
use App\Http\Middleware\ThrottleApiRequests;
use App\Models\Institution;
use Illuminate\Support\Facades\Route;

Route::get('/me', [AuthController::class, 'me'])
    ->middleware(['auth:sanctum', 'active', 'role:'.implode(',', UserRole::values())]);

// Mi cuenta (HU-S14-01): nombre y contraseña de la persona de la sesión, para todos los roles.
Route::middleware(['auth:sanctum', 'active', 'role:'.implode(',', UserRole::values())])->group(function (): void {
    Route::patch('/me', [AccountController::class, 'update'])->middleware('throttle:account-update');
    Route::put('/me/password', [AccountController::class, 'password'])->middleware('throttle:account-password');
    // T-S19-03 y T-S19-04: cambio y verificación del correo de acceso, con enlace de un solo uso (sin DELETE).
    Route::middleware('throttle:account-email')->group(function (): void {
        Route::post('/me/email', [AccountEmailController::class, 'request']);
        Route::post('/me/email/resend', [AccountEmailController::class, 'resend']);
        Route::post('/me/email/cancel', [AccountEmailController::class, 'cancel']);
        Route::post('/me/email/verification', [AccountEmailController::class, 'verification']);
    });
});

// Perfil de la organización (HU-S14-02): solo empresas e instituciones, siempre la de la sesión (sin ids).
Route::middleware(['auth:sanctum', 'active', 'role:'.UserRole::COMPANY->value.','.UserRole::INSTITUTION->value, 'throttle:organization-profile'])
    ->group(function (): void {
        Route::get('/organization/profile', [OrganizationProfileController::class, 'show']);
        Route::put('/organization/profile', [OrganizationProfileController::class, 'update']);
        // HU-S14-03: «Completar más tarde» del onboarding de la empresa.
        Route::post('/organization/profile/postpone', [OrganizationProfileController::class, 'postpone']);
    });

// Indicadores del inicio por rol (HU-S5-01): solo los de la cuenta y la organización de la sesión.
Route::get('/dashboard', DashboardController::class)
    ->middleware(['auth:sanctum', 'active', 'role:'.implode(',', UserRole::values())]);

// Reporte ejecutivo del programa de Educación Dual (HU-S7-01): solo conteos agregados para ADMIN y SECRETARY.
// Su exportación en CSV (HU-S7-02) contiene los mismos conteos por institución y por sector.
Route::middleware(['auth:sanctum', 'active', 'role:'.UserRole::ADMIN->value.','.UserRole::SECRETARY->value])
    ->group(function (): void {
        Route::get('/reports/dual-program', [ReportController::class, 'dualProgram']);
        Route::get('/reports/dual-program/export.csv', [ReportController::class, 'export'])->middleware('throttle:exports');
    });

// Bitácora de trazabilidad (HU-S7-03): solo ADMIN, a partir de las columnas de autoría ya registradas.
Route::get('/audit-events', [AuditEventController::class, 'index'])
    ->middleware(['auth:sanctum', 'active', 'role:'.UserRole::ADMIN->value]);

Route::bind('institution', function (string $value): Institution {
    // Evita enviar identificadores malformados o fuera de rango a PostgreSQL.
    $id = filter_var($value, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
    abort_if($id === false, 404);

    return Institution::query()->findOrFail($id);
});

Route::middleware(['auth:sanctum', 'active', 'role:'.UserRole::ADMIN->value])
    ->prefix('institutions')
    ->name('institutions.')
    ->group(function (): void {
        Route::get('/', [InstitutionController::class, 'index'])->name('index');
        Route::post('/', [InstitutionController::class, 'store'])->name('store');
        Route::get('/{institution}', [InstitutionController::class, 'show'])->name('show');
        Route::put('/{institution}', [InstitutionController::class, 'update'])->name('update');
        Route::patch('/{institution}/status', [InstitutionController::class, 'updateStatus'])->name('status');
        // T-S19-02: cuentas de la institución con su estado y corrección del correo de las pendientes.
        Route::get('/{institution}/accounts', [InstitutionAccountController::class, 'index'])->name('accounts');
        Route::patch('/{institution}/accounts/{account}/email', [InstitutionAccountController::class, 'correctEmail'])
            ->where('account', '[1-9][0-9]{0,17}')->middleware('throttle:institution-setup-resend')->name('accounts.email');
    });

Route::post('/institution-accounts', [InstitutionAccountController::class, 'store'])
    ->middleware(['auth:sanctum', 'active', 'role:'.UserRole::ADMIN->value]);

Route::post('/institution-accounts/resend-setup', [InstitutionSetupLinkController::class, 'store'])
    ->middleware(['auth:sanctum', 'active', 'role:'.UserRole::ADMIN->value, 'throttle:institution-setup-resend']);

Route::post('/institution-accounts/password-reset/start', [InstitutionPasswordResetController::class, 'start'])
    ->middleware(['auth:sanctum', 'active', 'role:'.UserRole::ADMIN->value, 'throttle:institution-password-reset']);

// Cuentas de la Secretaría de Economía (HU-S4-01): ADMIN y SECRETARY las listan, crean, reenvían su enlace y, desde
// HU-S6-04, cambian su estado e inician su restablecimiento de contraseña.
Route::middleware(['auth:sanctum', 'active', 'role:'.UserRole::ADMIN->value.','.UserRole::SECRETARY->value])
    ->prefix('secretary-accounts')
    ->group(function (): void {
        Route::get('/', [SecretaryAccountController::class, 'index']);
        Route::post('/', [SecretaryAccountController::class, 'store']);
        Route::post('/resend-setup', [SecretaryAccountController::class, 'resendSetup'])->middleware('throttle:secretary-setup-resend');
        // Estado y restablecimiento de contraseña (HU-S6-04).
        Route::patch('{account}/status', [SecretaryAccountController::class, 'updateStatus'])->where('account', '[1-9][0-9]{0,17}');
        // T-S19-02: corregir el correo de una cuenta pendiente de activar.
        Route::patch('{account}/email', [SecretaryAccountController::class, 'correctEmail'])->where('account', '[1-9][0-9]{0,17}')->middleware('throttle:secretary-setup-resend');
        Route::post('/password-reset/start', [SecretaryAccountController::class, 'startPasswordReset'])->middleware('throttle:account-password-reset');
    });

// Cuentas de Administración (HU-S16-02): solo ADMIN las lista, invita, activa o inactiva e inicia su restablecimiento.
// Nadie se inactiva a sí mismo y siempre queda al menos un Administrador activo.
Route::middleware(['auth:sanctum', 'active', 'role:'.UserRole::ADMIN->value])
    ->prefix('admin-accounts')
    ->group(function (): void {
        Route::get('/', [AdminAccountController::class, 'index']);
        Route::post('/', [AdminAccountController::class, 'store']);
        Route::post('/resend-setup', [AdminAccountController::class, 'resendSetup'])->middleware('throttle:admin-setup-resend');
        Route::patch('{account}/status', [AdminAccountController::class, 'updateStatus'])->where('account', '[1-9][0-9]{0,17}');
        Route::patch('{account}/email', [AdminAccountController::class, 'correctEmail'])->where('account', '[1-9][0-9]{0,17}')->middleware('throttle:admin-setup-resend');
        Route::post('/password-reset/start', [AdminAccountController::class, 'startPasswordReset'])->middleware('throttle:account-password-reset');
    });

// Empresas validadas por la Secretaría de Economía (HU-S4-02) y sus cuentas (HU-S4-03); sin DELETE.
Route::middleware(['auth:sanctum', 'active', 'role:'.UserRole::SECRETARY->value])
    ->prefix('companies')
    // Identificador acotado a un bigint: fuera de rango responde 404 sin llegar a PostgreSQL.
    ->where(['company' => '[1-9][0-9]{0,17}'])
    ->group(function (): void {
        Route::get('/', [CompanyController::class, 'index']);
        Route::post('/', [CompanyController::class, 'store']);
        Route::get('{company}', [CompanyController::class, 'show']);
        Route::put('{company}', [CompanyController::class, 'update']);
        Route::patch('{company}/status', [CompanyController::class, 'updateStatus']);
        // Cuentas de acceso de la empresa (HU-S4-03).
        Route::get('{company}/accounts', [CompanyAccountController::class, 'index']);
        Route::post('{company}/accounts', [CompanyAccountController::class, 'store']);
        Route::post('{company}/accounts/resend-setup', [CompanyAccountController::class, 'resendSetup'])->middleware('throttle:company-setup-resend');
        // Estado y restablecimiento de contraseña de las cuentas de la empresa (HU-S6-04).
        Route::patch('{company}/accounts/{account}/status', [CompanyAccountController::class, 'updateStatus'])->where('account', '[1-9][0-9]{0,17}');
        Route::patch('{company}/accounts/{account}/email', [CompanyAccountController::class, 'correctEmail'])->where('account', '[1-9][0-9]{0,17}')->middleware('throttle:company-setup-resend');
        Route::post('{company}/accounts/password-reset/start', [CompanyAccountController::class, 'startPasswordReset'])->middleware('throttle:account-password-reset');
    });

// Padrón (HU-S2-02), expediente (HU-S2-03), baja lógica (HU-S2-04), seguro facultativo (HU-S3-02) y
// CV normalizado (HU-S3-01) de la institución de la sesión; sin DELETE.
Route::middleware(['auth:sanctum', 'active', 'role:'.UserRole::INSTITUTION->value, 'institution.member'])
    ->prefix('students')
    ->name('students.')
    // Identificador acotado a un bigint: fuera de rango responde 404 sin llegar a PostgreSQL.
    ->where(['student' => '[1-9][0-9]{0,17}', 'certification' => '[1-9][0-9]{0,17}'])
    ->group(function (): void {
        Route::get('/', [StudentController::class, 'index'])->name('index');
        Route::post('/', [StudentController::class, 'store'])->name('store');
        Route::get('{student}', [StudentController::class, 'show'])->name('show');
        Route::put('{student}/profile', [StudentController::class, 'updateProfile'])->name('profile.update');
        Route::put('{student}/identity', [StudentController::class, 'updateIdentity'])->name('identity.update');
        Route::patch('{student}/status', [StudentController::class, 'updateStatus'])->name('status');
        Route::get('{student}/social-security', [StudentSocialSecurityController::class, 'show'])->name('social-security.show');
        Route::put('{student}/social-security', [StudentSocialSecurityController::class, 'update'])->name('social-security.update');
        Route::post('{student}/social-security/document', [StudentSocialSecurityController::class, 'storeDocument'])->middleware('throttle:uploads')->name('social-security.document.store');
        Route::get('{student}/social-security/document', [StudentSocialSecurityController::class, 'downloadDocument'])->name('social-security.document.show');
        Route::get('{student}/cv', [StudentCvController::class, 'show'])->name('cv.show');
        Route::put('{student}/cv/headline', [StudentCvController::class, 'updateHeadline'])->name('cv.headline.update');
        Route::put('{student}/cv/skills', [StudentCvController::class, 'updateSkills'])->name('cv.skills.update');
        Route::put('{student}/cv/languages', [StudentCvController::class, 'updateLanguages'])->name('cv.languages.update');
        Route::put('{student}/cv/certifications', [StudentCvController::class, 'updateCertifications'])->name('cv.certifications.update');
        Route::patch('{student}/cv/certifications/{certification}/verification', [StudentCvController::class, 'updateVerification'])->name('cv.certifications.verification');
        Route::put('{student}/cv/projects', [StudentCvController::class, 'updateProjects'])->name('cv.projects.update');
        Route::put('{student}/cv/links', [StudentCvController::class, 'updateLinks'])->name('cv.links.update');
    });

// Catálogo de habilidades para autocompletar: CV del alumno (HU-S3-01) y oportunidades duales (HU-S5-02).
Route::get('/skills', [SkillController::class, 'index'])
    ->middleware(['auth:sanctum', 'active', 'role:'.UserRole::INSTITUTION->value.','.UserRole::COMPANY->value, 'organization.member']);

// Catálogo INEGI de municipios por estado (HU-S4-04) para cualquier rol autenticado. Una clave de estado fuera
// de 01–32 responde 404 sin consultar la base.
Route::get('/catalogs/states/{state}/municipalities', [MunicipalityController::class, 'index'])
    ->middleware(['auth:sanctum', 'active', 'role:'.implode(',', UserRole::values())])
    ->where('state', '0[1-9]|[12][0-9]|3[0-2]');

// Buscador de talento anónimo para empresas (HU-S4-05): solo COMPANY con empresa activa (la empresa inactiva la
// rechaza `active` con COMPANY_INACTIVE). El alumno se identifica por su UUID público; otro formato responde 404.
Route::middleware(['auth:sanctum', 'active', 'role:'.UserRole::COMPANY->value, 'throttle:talent-search'])
    ->prefix('talent')
    ->where(['publicId' => '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'])
    ->group(function (): void {
        Route::get('/', [TalentController::class, 'index']);
        Route::get('{publicId}', [TalentController::class, 'show']);
    });

// Oportunidades de Educación Dual de la empresa de la sesión (HU-S5-02) y su baja lógica (HU-S5-03): solo COMPANY con empresa activa (la empresa
// inactiva la rechaza `active` con COMPANY_INACTIVE) y vinculada; sin DELETE.
Route::middleware(['auth:sanctum', 'active', 'role:'.UserRole::COMPANY->value, 'organization.member'])
    ->prefix('opportunities')
    // Identificador acotado a un bigint: fuera de rango responde 404 sin llegar a PostgreSQL.
    ->where(['opportunity' => '[1-9][0-9]{0,17}'])
    ->group(function (): void {
        Route::get('/', [OpportunityController::class, 'index']);
        Route::post('/', [OpportunityController::class, 'store']);
        Route::get('defaults', [OpportunityController::class, 'defaults']);
        // Oportunidades activas para una solicitud de vinculación (HU-S5-04).
        Route::get('options', [OpportunityController::class, 'options']);
        Route::get('{opportunity}', [OpportunityController::class, 'show']);
        Route::put('{opportunity}', [OpportunityController::class, 'update']);
        // Baja lógica (HU-S5-03).
        Route::patch('{opportunity}/status', [OpportunityController::class, 'updateStatus']);
    });

// Solicitudes de vinculación directas a la institución desde el perfil anónimo (HU-S5-04) y bandeja de la empresa
// con cancelación (HU-S5-05): solo COMPANY con empresa activa y vinculada; el alumno se identifica por su public_id.
Route::middleware(['auth:sanctum', 'active', 'role:'.UserRole::COMPANY->value, 'organization.member'])
    ->prefix('linkage-requests')
    // Identificador acotado a un bigint: fuera de rango responde 404 sin llegar a PostgreSQL.
    ->where(['linkageRequest' => '[1-9][0-9]{0,17}'])
    ->group(function (): void {
        Route::get('/', [LinkageRequestController::class, 'index']);
        // Conversaciones con mensajes sin leer, para el aviso del menú (HU-S13-04).
        Route::get('unread-summary', [LinkageMessageController::class, 'summary']);
        Route::post('/', [LinkageRequestController::class, 'store'])->middleware('throttle:linkage-requests');
        // Detalle de la solicitud (HU-S13-02).
        Route::get('{linkageRequest}', [LinkageRequestController::class, 'show']);
        Route::patch('{linkageRequest}/cancel', [LinkageRequestController::class, 'cancel']);
        // T-S14-13: baja de una vinculación aceptada; libera el lugar de la oportunidad.
        Route::patch('{linkageRequest}/termination', [LinkageRequestController::class, 'terminate']);
        // T-S19-05: ficha que la institución compartió; 404 si no está vigente o la vinculación no está aceptada.
        Route::get('{linkageRequest}/disclosure', [StudentDisclosureController::class, 'show']);
        // Conversación de la solicitud aceptada con la institución (HU-S13-01).
        Route::get('{linkageRequest}/messages', [LinkageMessageController::class, 'index']);
        Route::post('{linkageRequest}/messages', [LinkageMessageController::class, 'store'])->middleware('throttle:linkage-messages');
        Route::post('{linkageRequest}/messages/read', [LinkageMessageController::class, 'read']);
    });

// Bandeja institucional de solicitudes de vinculación con la identidad interna del alumno (HU-S6-01) y su respuesta
// (HU-S6-02): solo INSTITUTION con institución activa y vinculada; cada consulta se filtra por la institución de la
// sesión.
Route::middleware(['auth:sanctum', 'active', 'role:'.UserRole::INSTITUTION->value, 'institution.member'])
    ->prefix('institution/linkage-requests')
    // Identificador acotado a un bigint: fuera de rango responde 404 sin llegar a PostgreSQL.
    ->where(['linkageRequest' => '[1-9][0-9]{0,17}'])
    ->group(function (): void {
        Route::get('/', [InstitutionLinkageRequestController::class, 'index']);
        // Conversaciones con mensajes sin leer, para el aviso del menú (HU-S13-04).
        Route::get('unread-summary', [LinkageMessageController::class, 'summary']);
        // Exportación CSV de la bandeja (HU-S7-02).
        Route::get('/export.csv', [InstitutionLinkageRequestController::class, 'export'])->middleware('throttle:exports');
        Route::get('{linkageRequest}', [InstitutionLinkageRequestController::class, 'show']);
        // Respuesta institucional (HU-S6-02).
        Route::patch('{linkageRequest}/decision', [InstitutionLinkageRequestController::class, 'decide']);
        // T-S14-13: baja de una vinculación aceptada de su alumno.
        Route::patch('{linkageRequest}/termination', [InstitutionLinkageRequestController::class, 'terminate']);
        // T-S19-05: compartir la ficha con la empresa tras aceptar y dejar de compartirla (sin DELETE).
        Route::post('{linkageRequest}/disclosure', [StudentDisclosureController::class, 'store'])->middleware('throttle:linkage-disclosure');
        Route::patch('{linkageRequest}/disclosure/revoke', [StudentDisclosureController::class, 'revoke'])->middleware('throttle:linkage-disclosure');
        // Conversación de la solicitud aceptada con la empresa (HU-S13-01).
        Route::get('{linkageRequest}/messages', [LinkageMessageController::class, 'index']);
        Route::post('{linkageRequest}/messages', [LinkageMessageController::class, 'store'])->middleware('throttle:linkage-messages');
        Route::post('{linkageRequest}/messages/read', [LinkageMessageController::class, 'read']);
    });

// Videos promocionales del programa dual (HU-S9-01, HU-S9-02): solo INSTITUTION con institución activa y vinculada.
// La subida responde 202 y el worker procesa el video en la cola `videos`. {video} es el public_id.
Route::middleware(['auth:sanctum', 'active', 'role:'.UserRole::INSTITUTION->value, 'institution.member'])
    ->prefix('institution/videos')
    ->group(function (): void {
        Route::get('/', [InstitutionVideoController::class, 'index']);
        Route::post('/', [InstitutionVideoController::class, 'store'])->middleware('throttle:uploads');
        Route::put('{video}', [InstitutionVideoController::class, 'update']);
        Route::patch('{video}/status', [InstitutionVideoController::class, 'updateStatus']);
        // T-S9-04: elimina los archivos para liberar espacio; no es una ruta DELETE.
        Route::patch('{video}/deletion', [InstitutionVideoController::class, 'delete']);
    });

// Galería de promoción dual (HU-S9-03): COMPANY, SECRETARY y ADMIN ven los videos listos de instituciones activas; desde
// T-S14-19 también INSTITUTION, para el carrusel de su inicio (los videos son promoción pública del programa dual). Solo
// el Administrador puede inactivar uno (moderación mínima, CA-05); reactivarlo le corresponde a la institución.
Route::get('/promotional-videos', [PromotionalVideoController::class, 'index'])
    ->middleware(['auth:sanctum', 'active', 'role:'.UserRole::COMPANY->value.','.UserRole::SECRETARY->value.','.UserRole::ADMIN->value.','.UserRole::INSTITUTION->value]);
Route::patch('/promotional-videos/{video}/status', [PromotionalVideoController::class, 'deactivate'])
    ->middleware(['auth:sanctum', 'active', 'role:'.UserRole::ADMIN->value]);

// Videos y pósteres del disco de medios local (HU-S9-02): la URL firmada y temporal es la credencial, como una URL
// prefirmada de S3. Con MEDIA_DISK=s3 el navegador va directo al bucket y esta ruta no se usa.
Route::get('/media/{path}', MediaController::class)
    ->where('path', 'videos/[0-9]+/[0-9a-f-]{36}\\.(mp4|webm|jpg)')
    ->middleware('signed:relative')
    // La reproducción hace muchas peticiones por rango (206); la firma temporal ya acota el acceso.
    ->withoutMiddleware(ThrottleApiRequests::class)
    ->name('media.show');
