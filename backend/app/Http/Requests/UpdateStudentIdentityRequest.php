<?php

namespace App\Http\Requests;

/**
 * Corrección de la matrícula y el nombre de un alumno propio (HU-S2-03 CA-07):
 * mismas reglas que el alta; la unicidad la resuelve el controlador.
 */
class UpdateStudentIdentityRequest extends StoreStudentRequest {}
