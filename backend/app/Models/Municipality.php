<?php

namespace App\Models;

use App\Enums\MexicanState;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Query\Expression;
use Illuminate\Support\Facades\DB;

/**
 * Municipio del catálogo INEGI (HU-S4-04). Solo lectura: lo carga App\Support\MunicipalityCatalog.
 * El punto de su cabecera (location) es interno y nunca se expone.
 */
class Municipality extends Model
{
    protected $primaryKey = 'code';

    protected $keyType = 'string';

    public $incrementing = false;

    public $timestamps = false;

    protected $hidden = ['location'];

    protected function casts(): array
    {
        return ['state_code' => MexicanState::class];
    }

    /**
     * Subconsulta con el punto de la cabecera del municipio, para guardarla en la misma sentencia que el municipio
     * (empresas, HU-S4-02, y oportunidades, HU-S5-02).
     */
    public static function locationOf(string $municipalityCode): Expression
    {
        return DB::raw('(SELECT location FROM municipalities WHERE code = '.DB::getPdo()->quote($municipalityCode).')');
    }
}
