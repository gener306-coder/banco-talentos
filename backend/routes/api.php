<?php

use App\Enums\UserRole;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\CompanyAccountController;
use App\Http\Controllers\CompanyController;
use App\Http\Controllers\DashboardController;
use App\Http\Controllers\InstitutionAccountController;
use App\Http\Controllers\InstitutionController;
use App\Http\Controllers\InstitutionLinkageRequestController;
use App\Http\Controllers\InstitutionPasswordResetController;
use App\Http\Controllers\InstitutionSetupLinkController;
use App\Http\Controllers\LinkageRequestController;
use App\Http\Controllers\MunicipalityController;
use App\Http\Controllers\OpportunityController;
use App\Http\Controllers\SecretaryAccountController;
use App\Http\Controllers\SkillController;
use App\Http\Controllers\StudentController;
use App\Http\Controllers\StudentCvController;
use App\Http\Controllers\StudentSocialSecurityController;
use App\Http\Controllers\TalentController;
use App\Models\Institution;
use Illuminate\Support\Facades\Route;

Route::get('/me', [AuthController::class, 'me'])
    ->middleware(['auth:sanctum', 'active', 'role:'.implode(',', UserRole::values())]);

// Indicadores del inicio por rol (HU-S5-01): solo los de la cuenta y la organización de la sesión.
Route::get('/dashboard', DashboardController::class)
    ->middleware(['auth:sanctum', 'active', 'role:'.implode(',', UserRole::values())]);

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
    });

Route::post('/institution-accounts', [InstitutionAccountController::class, 'store'])
    ->middleware(['auth:sanctum', 'active', 'role:'.UserRole::ADMIN->value]);

Route::post('/institution-accounts/resend-setup', [InstitutionSetupLinkController::class, 'store'])
    ->middleware(['auth:sanctum', 'active', 'role:'.UserRole::ADMIN->value, 'throttle:institution-setup-resend']);

Route::post('/institution-accounts/password-reset/start', [InstitutionPasswordResetController::class, 'start'])
    ->middleware(['auth:sanctum', 'active', 'role:'.UserRole::ADMIN->value, 'throttle:institution-password-reset']);

// Cuentas de la Secretaría de Economía (HU-S4-01): ADMIN y SECRETARY las listan, crean y reenvían su enlace.
Route::middleware(['auth:sanctum', 'active', 'role:'.UserRole::ADMIN->value.','.UserRole::SECRETARY->value])
    ->prefix('secretary-accounts')
    ->group(function (): void {
        Route::get('/', [SecretaryAccountController::class, 'index']);
        Route::post('/', [SecretaryAccountController::class, 'store']);
        Route::post('/resend-setup', [SecretaryAccountController::class, 'resendSetup'])->middleware('throttle:secretary-setup-resend');
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
        Route::post('{student}/social-security/document', [StudentSocialSecurityController::class, 'storeDocument'])->name('social-security.document.store');
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
        Route::post('/', [LinkageRequestController::class, 'store'])->middleware('throttle:linkage-requests');
        Route::patch('{linkageRequest}/cancel', [LinkageRequestController::class, 'cancel']);
    });

// Bandeja institucional de solicitudes de vinculación con la identidad interna del alumno (HU-S6-01): solo
// INSTITUTION con institución activa y vinculada; cada consulta se filtra por la institución de la sesión.
Route::middleware(['auth:sanctum', 'active', 'role:'.UserRole::INSTITUTION->value, 'institution.member'])
    ->prefix('institution/linkage-requests')
    // Identificador acotado a un bigint: fuera de rango responde 404 sin llegar a PostgreSQL.
    ->where(['linkageRequest' => '[1-9][0-9]{0,17}'])
    ->group(function (): void {
        Route::get('/', [InstitutionLinkageRequestController::class, 'index']);
        Route::get('{linkageRequest}', [InstitutionLinkageRequestController::class, 'show']);
    });
