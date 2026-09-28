<?php

use App\Enums\UserRole;
use App\Http\Controllers\AuthController;
use Illuminate\Support\Facades\Route;

Route::get('/me', [AuthController::class, 'me'])
    ->middleware(['auth:sanctum', 'active', 'role:'.implode(',', UserRole::values())]);
