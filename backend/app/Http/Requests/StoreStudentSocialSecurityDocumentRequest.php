<?php

namespace App\Http\Requests;

use Closure;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Http\UploadedFile;

class StoreStudentSocialSecurityDocumentRequest extends FormRequest
{
    /** Tamaño máximo del comprobante en KB (2 MB, igual que upload_max_filesize de PHP). */
    public const MAX_KILOBYTES = 2048;

    public function authorize(): bool
    {
        // El rol y la institución los garantizan los middlewares; la pertenencia del alumno, el controlador.
        return true;
    }

    public function rules(): array
    {
        return [
            'document' => [
                'required', 'file', 'extensions:pdf', 'mimes:pdf', 'mimetypes:application/pdf', 'max:'.self::MAX_KILOBYTES,
                // La extensión y el tipo MIME los deduce PHP; además se exige la firma de un PDF real.
                function (string $attribute, mixed $value, Closure $fail): void {
                    if (! $value instanceof UploadedFile || ! self::startsLikePdf($value)) {
                        $fail('El comprobante debe ser un archivo PDF.');
                    }
                },
            ],
        ];
    }

    public function messages(): array
    {
        return [
            'document.required' => 'Selecciona el comprobante de vigencia del IMSS.',
            'document.file' => 'No se pudo recibir el comprobante. Verifica que pese como máximo 2 MB.',
            'document.uploaded' => 'No se pudo recibir el comprobante. Verifica que pese como máximo 2 MB.',
            'document.extensions' => 'El comprobante debe ser un archivo PDF.',
            'document.mimes' => 'El comprobante debe ser un archivo PDF.',
            'document.mimetypes' => 'El comprobante debe ser un archivo PDF.',
            'document.max' => 'El comprobante no debe superar 2 MB.',
        ];
    }

    private static function startsLikePdf(UploadedFile $file): bool
    {
        $handle = @fopen($file->getRealPath(), 'rb');
        if ($handle === false) {
            return false;
        }
        $signature = fread($handle, 5);
        fclose($handle);

        return $signature === '%PDF-';
    }
}
