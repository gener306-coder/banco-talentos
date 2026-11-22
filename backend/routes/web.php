<?php

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
    Route::post('/login', [AuthController::class, 'login'])->middleware('throttle:login');
    Route::post('/logout', [AuthController::class, 'logout'])->middleware(['auth:sanctum', 'active']);
});
