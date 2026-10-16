<?php

namespace App\Http\Controllers\Concerns;

use App\Models\Student;
use Illuminate\Http\Request;

trait FindsOwnedStudent
{
    /**
     * Anti-IDOR (HU-S2-03 CA-05, HU-S3-02 CA-03): el alumno se busca siempre dentro de la institución
     * de la sesión. Uno ajeno responde igual que uno inexistente, para no revelar que existe.
     */
    private function owned(Request $request, string $id, array $with = ['identity']): Student
    {
        $student = Student::query()
            ->where('institution_id', $request->user()->institution_id)
            ->with($with)
            ->find((int) $id);

        abort_if($student === null, 404, 'El alumno no existe.');

        return $student;
    }
}
