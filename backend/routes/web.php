<?php

use App\Http\Controllers\AuthController;
use App\Http\Controllers\InitialPasswordController;
use App\Http\Controllers\InstitutionPasswordResetController;
use Illuminate\Support\Facades\Route;

Route::prefix('api')->group(function (): void {
    Route::post('/institution-accounts/password-setup', [InitialPasswordController::class, 'store'])
        ->middleware('throttle:password-setup');
    Route::post('/institution-accounts/password-reset', [InstitutionPasswordResetController::class, 'reset'])
        ->middleware('throttle:password-reset');
    Route::post('/login', [AuthController::class, 'login'])->middleware('throttle:login');
    Route::post('/logout', [AuthController::class, 'logout'])->middleware(['auth:sanctum', 'active']);
});
