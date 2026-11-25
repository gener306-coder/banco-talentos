<?php

use App\Http\Controllers\AccountEmailController;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\InitialPasswordController;
use App\Http\Controllers\InstitutionPasswordResetController;
use App\Http\Controllers\PasswordForgotController;
use Illuminate\Support\Facades\Route;

Route::prefix('api')->group(function (): void {
    Route::post('/institution-accounts/password-setup', [InitialPasswordController::class, 'store'])
        ->middleware('throttle:password-setup');
    Route::post('/institution-accounts/password-reset', [InstitutionPasswordResetController::class, 'reset'])
        ->middleware('throttle:password-reset');
    // HU-S16-03: «Olvidé mi contraseña» para los 4 roles; respuesta neutra y límites por correo y por IP.
    Route::post('/password/forgot', [PasswordForgotController::class, 'store'])->middleware('throttle:password-forgot');
    // T-S19-03 y T-S19-04: confirmación pública del correo de acceso, con o sin sesión.
    Route::post('/account-email/confirm', [AccountEmailController::class, 'confirm'])->middleware('throttle:email-confirm');
    Route::post('/login', [AuthController::class, 'login'])->middleware('throttle:login');
    Route::post('/logout', [AuthController::class, 'logout'])->middleware(['auth:sanctum', 'active']);
});
