<?php

namespace App\Exceptions;

use Illuminate\Http\JsonResponse;
use RuntimeException;

class AccountAccessDenied extends RuntimeException
{
    public function __construct(public readonly string $reason, private readonly int $status = 401)
    {
        parent::__construct(match ($reason) {
            'INSTITUTION_INACTIVE' => 'La institución está inactiva. No puedes acceder al sistema.',
            'PASSWORD_SETUP_REQUIRED' => 'Debes establecer tu contraseña antes de iniciar sesión.',
            default => 'La cuenta está inactiva. No puedes acceder al sistema.',
        });
    }

    public function render(): JsonResponse
    {
        return response()->json([
            'message' => $this->getMessage(),
            'code' => $this->reason,
        ], $this->status)->header('Cache-Control', 'no-store, private');
    }
}
