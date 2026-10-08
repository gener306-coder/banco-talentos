<?php

use App\Enums\UserRole;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\InstitutionAccountController;
use App\Http\Controllers\InstitutionController;
use App\Http\Controllers\InstitutionPasswordResetController;
use App\Http\Controllers\InstitutionSetupLinkController;
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
