<?php

namespace App\Http\Requests;

use App\Rules\NoContactInformation;
use App\Support\ContactInformation;
use Illuminate\Foundation\Http\FormRequest;

class StoreInstitutionVideoRequest extends FormRequest
{
    /** Tamaño máximo del video en KB (250 MB, igual que upload_max_filesize de docker/backend/php.ini). */
    public const MAX_KILOBYTES = 250 * 1024;

    public function authorize(): bool
    {
        // El rol y la institución los garantizan los middlewares.
        return true;
    }

    public function rules(): array
    {
        return [
            // La extensión y el tipo MIME solo filtran a la entrada: ffprobe verifica el contenido real al procesarlo.
            'video' => ['required', 'file', 'extensions:mp4,mov,webm', 'mimetypes:video/mp4,video/quicktime,video/webm', 'max:'.self::MAX_KILOBYTES],
            'title' => ['required', 'string', 'max:120', new NoContactInformation(ContactInformation::VIDEO_MESSAGE)],
            'description' => ['nullable', 'string', 'max:1000', new NoContactInformation(ContactInformation::VIDEO_MESSAGE)],
            'consent' => ['accepted'],
        ];
    }

    public function messages(): array
    {
        return [
            'video.required' => 'Selecciona el video.',
            'video.file' => 'No se pudo recibir el video. Verifica que pese como máximo 250 MB.',
            'video.uploaded' => 'No se pudo recibir el video. Verifica que pese como máximo 250 MB.',
            'video.extensions' => 'El video debe ser MP4, MOV o WebM.',
            'video.mimetypes' => 'El video debe ser MP4, MOV o WebM.',
            'video.max' => 'El video no debe superar 250 MB.',
            'title.required' => 'El título es obligatorio.',
            'title.max' => 'El título no debe superar 120 caracteres.',
            'description.max' => 'La descripción no debe superar 1000 caracteres.',
            'consent.accepted' => 'Confirma que cuentas con la autorización de las personas y empresas que aparecen o se mencionan en el video.',
        ];
    }
}
