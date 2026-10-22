<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Concerns\FindsOwnedStudent;
use App\Http\Requests\StoreStudentRequest;
use App\Http\Requests\UpdateStudentIdentityRequest;
use App\Http\Requests\UpdateStudentProfileRequest;
use App\Http\Requests\UpdateStudentStatusRequest;
use App\Models\Student;
use App\Models\StudentIdentity;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Padrón estudiantil (HU-S2-02), expediente (HU-S2-03) y baja lógica (HU-S2-04) de la institución de la sesión. Todas las
 * consultas se acotan al institution_id del usuario autenticado; el cliente nunca lo elige.
 */
class StudentController extends Controller
{
    use FindsOwnedStudent;

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

    public function show(Request $request, string $student): JsonResponse
    {
        return $this->detail($this->owned($request, $student));
    }

    public function updateProfile(UpdateStudentProfileRequest $request, string $student): JsonResponse
    {
        $record = $this->owned($request, $student);

        DB::transaction(function () use ($record, $request): void {
            // Solo columnas del expediente: la identidad y la institución no cambian por esta vía.
            $record->fill($request->validated());
            // El municipio ya viene del catálogo: el texto libre anterior deja de estar pendiente (HU-S4-04 CA-06).
            $record->legacy_municipality = null;
            $record->save();
            $this->locate($record);
        });

        return $this->detail($record);
    }

    public function updateIdentity(UpdateStudentIdentityRequest $request, string $student): JsonResponse
    {
        $record = $this->owned($request, $student);
        $identity = $record->identity;

        if ($this->enrollmentTaken($record->institution_id, $request->validated('enrollment_number'), $record->id)) {
            $this->duplicateEnrollment();
        }

        try {
            DB::transaction(fn () => $identity->fill($request->validated())->save());
        } catch (UniqueConstraintViolationException $exception) {
            if ($exception->index !== 'student_identities_institution_enrollment_unique') {
                throw $exception;
            }
            $this->duplicateEnrollment();
        }

        return $this->detail($record);
    }

    /**
     * Baja lógica (HU-S2-04): inactivar oculta al alumno del Banco de Talentos sin borrar su expediente.
     * No existe DELETE; la pertenencia se verifica igual que en el resto del expediente (CA-04).
     */
    public function updateStatus(UpdateStudentStatusRequest $request, string $student): JsonResponse
    {
        $record = $this->owned($request, $student);
        $record->is_active = $request->validated('is_active');
        $record->save();

        return $this->detail($record);
    }

    /**
     * Ubicación aproximada para búsquedas por radio: el punto de la cabecera del municipio (HU-S4-04), o el punto
     * de referencia del estado mientras el municipio esté por confirmar. El cliente nunca envía coordenadas.
     */
    private function locate(Student $student): void
    {
        if ($student->municipality_code !== null) {
            DB::update(
                'UPDATE students SET location = m.location FROM municipalities m WHERE students.id = ? AND m.code = students.municipality_code',
                [$student->id],
            );

            return;
        }

        [$latitude, $longitude] = $student->state_code->referencePoint();

        // PostGIS recibe longitud y latitud, en ese orden.
        DB::update(
            'UPDATE students SET location = ST_SetSRID(ST_MakePoint(?, ?), 4326)::geography WHERE id = ?',
            [$longitude, $latitude, $student->id],
        );
    }

    private function enrollmentTaken(int $institutionId, string $enrollment, ?int $exceptStudentId = null): bool
    {
        return StudentIdentity::query()
            ->where('institution_id', $institutionId)
            ->whereRaw('lower(enrollment_number) = lower(?)', [$enrollment])
            ->when($exceptStudentId, fn ($query) => $query->where('student_id', '!=', $exceptStudentId))
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
            'is_active' => $student->is_active,
            'created_at' => $student->created_at?->toISOString(),
        ];
    }

    private function detail(Student $student): JsonResponse
    {
        return response()->json(['data' => [
            ...$this->present($student),
            'profile' => [
                'program' => $student->program,
                'period_type' => $student->period_type?->value,
                'period_number' => $student->period_number,
                'dual_available' => $student->dual_available,
                'state_code' => $student->state_code?->value,
                'municipality_code' => $student->municipality_code,
                'municipality' => $student->municipality?->name,
                // Texto libre anterior al catálogo, aún sin clave: la interfaz lo muestra «por confirmar».
                'pending_municipality' => $student->legacy_municipality,
                'can_relocate' => $student->can_relocate,
            ],
        ]])->header('Cache-Control', 'no-store, private');
    }
}
