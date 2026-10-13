<?php

namespace App\Http\Controllers;

use App\Http\Requests\StoreStudentRequest;
use App\Models\Student;
use App\Models\StudentIdentity;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Padrón estudiantil de la institución de la sesión (HU-S2-02). Todas las consultas se acotan
 * al institution_id del usuario autenticado; el cliente nunca lo elige.
 */
class StudentController extends Controller
{
    private const PER_PAGE = 50;

    public function index(Request $request): JsonResponse
    {
        $page = Student::query()
            ->where('students.institution_id', $request->user()->institution_id)
            ->join('student_identities', 'student_identities.student_id', '=', 'students.id')
            ->orderBy('student_identities.first_surname')
            ->orderBy('student_identities.second_surname')
            ->orderBy('student_identities.given_names')
            ->orderBy('students.id')
            ->select('students.*')
            ->with('identity')
            ->paginate(self::PER_PAGE);

        return response()->json([
            'data' => $page->getCollection()->map(fn (Student $student): array => $this->present($student))->values(),
            'meta' => [
                'current_page' => $page->currentPage(),
                'last_page' => $page->lastPage(),
                'total' => $page->total(),
            ],
        ])->header('Cache-Control', 'no-store, private');
    }

    public function store(StoreStudentRequest $request): JsonResponse
    {
        $data = $request->validated();
        $institutionId = $request->user()->institution_id;

        if ($this->enrollmentTaken($institutionId, $data['enrollment_number'])) {
            $this->duplicateEnrollment();
        }

        try {
            $student = DB::transaction(function () use ($data, $institutionId): Student {
                $student = new Student;
                $student->institution_id = $institutionId;
                $student->save();

                $identity = new StudentIdentity($data);
                $identity->student_id = $student->id;
                $identity->institution_id = $institutionId;
                $identity->save();

                return $student->setRelation('identity', $identity);
            });
        } catch (UniqueConstraintViolationException $exception) {
            // Dos altas simultáneas con la misma matrícula: la restricción es la última garantía.
            if ($exception->index !== 'student_identities_institution_enrollment_unique') {
                throw $exception;
            }
            $this->duplicateEnrollment();
        }

        return response()->json(['data' => $this->present($student)], 201)
            ->header('Cache-Control', 'no-store, private');
    }

    private function enrollmentTaken(int $institutionId, string $enrollment): bool
    {
        return StudentIdentity::query()
            ->where('institution_id', $institutionId)
            ->whereRaw('lower(enrollment_number) = lower(?)', [$enrollment])
            ->exists();
    }

    private function duplicateEnrollment(): never
    {
        throw ValidationException::withMessages([
            'enrollment_number' => ['Ya existe un alumno con esa matrícula en tu institución.'],
        ]);
    }

    private function present(Student $student): array
    {
        return [
            'id' => $student->id,
            'enrollment_number' => $student->identity->enrollment_number,
            'given_names' => $student->identity->given_names,
            'first_surname' => $student->identity->first_surname,
            'second_surname' => $student->identity->second_surname,
            'created_at' => $student->created_at?->toISOString(),
        ];
    }
}
