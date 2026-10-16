<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Concerns\FindsOwnedStudent;
use App\Http\Requests\StoreStudentSocialSecurityDocumentRequest;
use App\Http\Requests\UpdateStudentSocialSecurityRequest;
use App\Models\Student;
use App\Models\StudentSocialSecurity;
use App\Support\SocialSecurityNumber;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\StreamedResponse;
use Throwable;

/**
 * Seguro facultativo (HU-S3-02): NSS y comprobante del IMSS de un alumno propio. Es resguardo
 * exclusivo de la institución: nada de esto aparece en el padrón, el detalle ni el perfil público.
 */
class StudentSocialSecurityController extends Controller
{
    use FindsOwnedStudent;

    /** Disco privado (storage/app/private): no se sirve por HTTP; solo se descarga por este controlador. */
    private const DISK = 'local';

    private const DOWNLOAD_NAME = 'comprobante-imss.pdf';

    public function show(Request $request, string $student): JsonResponse
    {
        return $this->present($this->owned($request, $student, ['socialSecurity'])->socialSecurity);
    }

    public function update(UpdateStudentSocialSecurityRequest $request, string $student): JsonResponse
    {
        $record = $this->owned($request, $student, ['socialSecurity']);
        $nss = $request->validated('nss');

        if ($this->nssTaken($record, $nss)) {
            $this->duplicateNss();
        }

        $security = $this->recordFor($record);
        $security->nss = $nss;

        try {
            DB::transaction(fn () => $security->save());
        } catch (UniqueConstraintViolationException $exception) {
            // Dos capturas simultáneas del mismo NSS: la restricción es la última garantía.
            if ($exception->index !== 'student_social_security_institution_nss_unique') {
                throw $exception;
            }
            $this->duplicateNss();
        }

        return $this->present($security);
    }

    public function storeDocument(StoreStudentSocialSecurityDocumentRequest $request, string $student): JsonResponse
    {
        $record = $this->owned($request, $student, ['socialSecurity']);
        $file = $request->file('document');
        $security = $this->recordFor($record);
        $previous = $security->document_path;

        // Nombre aleatorio: la ruta no deriva de nada que envíe el cliente.
        $path = $file->storeAs('imss/'.$record->institution_id, Str::uuid()->toString().'.pdf', self::DISK);
        abort_if($path === false, 500, 'No se pudo guardar el comprobante.');

        try {
            $security->document_path = $path;
            $security->document_name = $this->displayName($file->getClientOriginalName());
            $security->document_size = $file->getSize();
            $security->document_sha256 = hash_file('sha256', Storage::disk(self::DISK)->path($path));
            $security->document_uploaded_at = now();
            DB::transaction(fn () => $security->save());
        } catch (Throwable $exception) {
            Storage::disk(self::DISK)->delete($path);
            throw $exception;
        }

        // El comprobante anterior solo se borra cuando el nuevo ya quedó registrado.
        if ($previous !== null && $previous !== $path) {
            Storage::disk(self::DISK)->delete($previous);
        }

        return $this->present($security);
    }

    public function downloadDocument(Request $request, string $student): StreamedResponse
    {
        $security = $this->owned($request, $student, ['socialSecurity'])->socialSecurity;
        $path = $security?->document_path;

        abort_if($path === null || ! Storage::disk(self::DISK)->exists($path), 404, 'El alumno no tiene comprobante del IMSS.');

        return Storage::disk(self::DISK)->download($path, self::DOWNLOAD_NAME, [
            'Content-Type' => 'application/pdf',
            'X-Content-Type-Options' => 'nosniff',
            'Cache-Control' => 'no-store, private',
        ]);
    }

    private function recordFor(Student $student): StudentSocialSecurity
    {
        if ($student->socialSecurity !== null) {
            return $student->socialSecurity;
        }

        $security = new StudentSocialSecurity;
        $security->student_id = $student->id;
        $security->institution_id = $student->institution_id;

        return $security;
    }

    private function nssTaken(Student $student, string $nss): bool
    {
        return StudentSocialSecurity::query()
            ->where('institution_id', $student->institution_id)
            ->where('nss_hash', SocialSecurityNumber::blindIndex($nss))
            ->where('student_id', '!=', $student->id)
            ->exists();
    }

    private function duplicateNss(): never
    {
        throw ValidationException::withMessages([
            'nss' => ['Ya existe un alumno con ese NSS en tu institución.'],
        ]);
    }

    /** Nombre original solo para mostrarlo: sin rutas ni caracteres de control, y acotado. */
    private function displayName(string $original): string
    {
        $name = preg_replace('/[\x00-\x1F\x7F]+/u', '', basename(str_replace('\\', '/', $original))) ?? '';

        return Str::limit(trim($name), 200, '') ?: self::DOWNLOAD_NAME;
    }

    private function present(?StudentSocialSecurity $security): JsonResponse
    {
        $document = $security?->document_path === null ? null : [
            'name' => $security->document_name,
            'size' => $security->document_size,
            'uploaded_at' => $security->document_uploaded_at?->toISOString(),
        ];

        return response()->json(['data' => [
            'nss' => $security?->nss,
            'document' => $document,
        ]])->header('Cache-Control', 'no-store, private');
    }
}
