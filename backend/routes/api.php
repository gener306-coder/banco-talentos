<?php

use App\Enums\UserRole;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\InstitutionAccountController;
use App\Http\Controllers\InstitutionController;
use App\Http\Controllers\InstitutionPasswordResetController;
use App\Http\Controllers\InstitutionSetupLinkController;
use App\Http\Controllers\MunicipalityController;
use App\Http\Controllers\SkillController;
use App\Http\Controllers\StudentController;
use App\Http\Controllers\StudentCvController;
use App\Http\Controllers\StudentSocialSecurityController;
use App\Models\Institution;
use Illuminate\Support\Facades\Route;

Route::get('/me', [AuthController::class, 'me'])
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

// Catálogo de habilidades del CV (HU-S3-01) para autocompletar.
Route::get('/skills', [SkillController::class, 'index'])
    ->middleware(['auth:sanctum', 'active', 'role:'.UserRole::INSTITUTION->value, 'institution.member']);

// Catálogo INEGI de municipios por estado (HU-S4-04) para cualquier rol autenticado. Una clave de estado fuera
// de 01–32 responde 404 sin consultar la base.
Route::get('/catalogs/states/{state}/municipalities', [MunicipalityController::class, 'index'])
    ->middleware(['auth:sanctum', 'active', 'role:'.implode(',', UserRole::values())])
    ->where('state', '0[1-9]|[12][0-9]|3[0-2]');
