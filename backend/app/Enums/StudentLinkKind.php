<?php

namespace App\Enums;

/**
 * Tipo de enlace externo del CV (HU-S3-01 CA-01). Los enlaces revelan la identidad: son datos protegidos (CA-02).
 */
enum StudentLinkKind: string
{
    case GITHUB = 'github';
    case LINKEDIN = 'linkedin';
    case BEHANCE = 'behance';
    case PORTFOLIO = 'portfolio';
    case OTHER = 'other';

    /** Dominio que debe tener el enlace, o null si se admite cualquiera. */
    public function requiredHost(): ?string
    {
        return config('cv.link_hosts.'.$this->value);
    }
}
