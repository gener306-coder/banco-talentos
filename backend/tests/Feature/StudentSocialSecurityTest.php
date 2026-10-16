<?php

use App\Enums\UserRole;
use App\Models\Institution;
use App\Models\Student;
use App\Models\StudentSocialSecurity;
use App\Models\User;
use App\Support\SocialSecurityNumber;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Tests\Support\InteractsWithCookieSessions;

uses(RefreshDatabase::class, InteractsWithCookieSessions::class);

/** Completa diez dígitos con su dígito verificador de Luhn. */
function nssWithCheckDigit(string $payload): string
{
    foreach (range(0, 9) as $digit) {
        if (SocialSecurityNumber::isValid($payload.$digit)) {
            return $payload.$digit;
        }
    }
    throw new LogicException('Sin dígito verificador.');
}

function pdfUpload(string $name = 'vigencia.pdf', string $body = "%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF\n"): UploadedFile
{
    return UploadedFile::fake()->createWithContent($name, $body);
}

function securityUrl(Student|int $student, string $suffix = ''): string
{
    return '/api/students/'.($student instanceof Student ? $student->id : $student).'/social-security'.$suffix;
}

beforeEach(function () {
    Storage::fake('local');
    $this->initializeCookieBrowser();
    $this->institution = Institution::factory()->create();
    $this->account = User::factory()->forInstitution($this->institution)->create();
    $this->student = Student::factory()->for($this->institution)->withIdentity(['enrollment_number' => 'A2026-001'])->create();
    $this->other = Institution::factory()->create();
    $this->foreign = Student::factory()->for($this->other)->withIdentity(['enrollment_number' => 'AJENO-1'])->create();
    $this->nss = nssWithCheckDigit('1234567890');
});

function signInSecurityInstitution($test): void
{
    $test->loginWithCookies($test->account)->assertOk();
}

function uploadDocument($test, Student|int $student, UploadedFile $file)
{
    return $test->browserRequest('POST', securityUrl($student, '/document'), files: ['document' => $file]);
}

describe('NSS', function () {
    it('validates the check digit with the Luhn algorithm', function () {
        expect(SocialSecurityNumber::isValid('12345678903'))->toBeTrue();
        expect(SocialSecurityNumber::isValid('12345678904'))->toBeFalse();
        expect(SocialSecurityNumber::isValid('1234567890'))->toBeFalse();
        expect(SocialSecurityNumber::isValid('1234567890a'))->toBeFalse();
        expect(SocialSecurityNumber::normalize(' 1234-5678 903 '))->toBe('12345678903');
    });

    it('starts empty for a student without social security', function () {
        signInSecurityInstitution($this);
        $this->browserRequest('GET', securityUrl($this->student))
            ->assertOk()
            ->assertHeader('Cache-Control', 'no-store, private')
            ->assertExactJson(['data' => ['nss' => null, 'document' => null]]);
        $this->assertDatabaseCount('student_social_security', 0);
    });

    it('saves the NSS of an own student, normalizing spaces and hyphens', function () {
        signInSecurityInstitution($this);
        $this->browserRequest('PUT', securityUrl($this->student), ['nss' => ' 1234-5678-90 3 '])
            ->assertOk()
            ->assertHeader('Cache-Control', 'no-store, private')
            ->assertExactJson(['data' => ['nss' => '12345678903', 'document' => null]]);

        $this->browserRequest('GET', securityUrl($this->student))->assertOk()->assertJsonPath('data.nss', '12345678903');
        $record = StudentSocialSecurity::sole();
        expect($record->student_id)->toBe($this->student->id);
        expect($record->institution_id)->toBe($this->institution->id);
    });

    it('stores the NSS encrypted and only its blind index in clear (CA-01)', function () {
        signInSecurityInstitution($this);
        $this->browserRequest('PUT', securityUrl($this->student), ['nss' => $this->nss])->assertOk();

        $row = DB::table('student_social_security')->sole();
        expect($row->nss)->not->toContain($this->nss);
        expect(Crypt::decryptString($row->nss))->toBe($this->nss);
        expect($row->nss_hash)->toMatch('/^[0-9a-f]{64}$/')->toBe(SocialSecurityNumber::blindIndex($this->nss));
        expect($row->nss_hash)->not->toBe(hash('sha256', $this->nss));
        expect(DB::table('student_social_security')->where('nss', 'like', '%'.$this->nss.'%')->exists())->toBeFalse();
    });

    it('recalculates the blind index when the NSS changes', function () {
        signInSecurityInstitution($this);
        $this->browserRequest('PUT', securityUrl($this->student), ['nss' => $this->nss])->assertOk();
        $other = nssWithCheckDigit('9876543210');
        $this->browserRequest('PUT', securityUrl($this->student), ['nss' => $other])->assertOk()->assertJsonPath('data.nss', $other);

        expect(DB::table('student_social_security')->value('nss_hash'))->toBe(SocialSecurityNumber::blindIndex($other));
        $this->assertDatabaseCount('student_social_security', 1);
    });

    it('never lets the client choose the blind index, the student or the institution', function () {
        signInSecurityInstitution($this);
        $this->browserRequest('PUT', securityUrl($this->student), [
            'nss' => $this->nss, 'nss_hash' => str_repeat('a', 64), 'student_id' => $this->foreign->id,
            'institution_id' => $this->other->id, 'document_path' => '../../.env',
        ])->assertOk();

        $record = StudentSocialSecurity::sole();
        expect($record->nss_hash)->toBe(SocialSecurityNumber::blindIndex($this->nss));
        expect([$record->student_id, $record->institution_id, $record->document_path])->toBe([$this->student->id, $this->institution->id, null]);
    });

    it('validates the NSS without writing it', function (mixed $nss, string $message) {
        signInSecurityInstitution($this);
        $this->browserRequest('PUT', securityUrl($this->student), ['nss' => $nss])
            ->assertUnprocessable()->assertJsonValidationErrors(['nss' => $message]);
        $this->assertDatabaseCount('student_social_security', 0);
    })->with([
        'missing' => [null, 'El NSS es obligatorio.'],
        'blank' => ['  ', 'El NSS es obligatorio.'],
        'number' => [12345678903, 'El NSS no es válido.'],
        'short' => ['1234567890', 'El NSS debe tener 11 dígitos.'],
        'long' => ['123456789031', 'El NSS debe tener 11 dígitos.'],
        'letters' => ['1234567890A', 'El NSS debe tener 11 dígitos.'],
        'dots' => ['1234.5678.903', 'El NSS debe tener 11 dígitos.'],
        'check digit' => ['12345678904', 'El dígito verificador del NSS no es válido. Revisa que esté bien escrito.'],
    ]);

    it('rejects an NSS already used by another student of the institution', function () {
        $classmate = Student::factory()->for($this->institution)->withIdentity()->create();
        signInSecurityInstitution($this);
        $this->browserRequest('PUT', securityUrl($classmate), ['nss' => $this->nss])->assertOk();

        $this->browserRequest('PUT', securityUrl($this->student), ['nss' => '1234 5678 903'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['nss' => 'Ya existe un alumno con ese NSS en tu institución.']);
        $this->assertDatabaseCount('student_social_security', 1);
    });

    it('lets a student keep its own NSS', function () {
        signInSecurityInstitution($this);
        $this->browserRequest('PUT', securityUrl($this->student), ['nss' => $this->nss])->assertOk();
        $this->browserRequest('PUT', securityUrl($this->student), ['nss' => $this->nss])->assertOk();
    });

    it('allows the same NSS in another institution', function () {
        $this->loginWithCookies(User::factory()->forInstitution($this->other)->create())->assertOk();
        $this->browserRequest('PUT', securityUrl($this->foreign), ['nss' => $this->nss])->assertOk();

        $this->initializeCookieBrowser();
        signInSecurityInstitution($this);
        $this->browserRequest('PUT', securityUrl($this->student), ['nss' => $this->nss])->assertOk();
        $this->assertDatabaseCount('student_social_security', 2);
    });

    it('relies on the database constraint when a concurrent capture takes the NSS', function () {
        $classmate = Student::factory()->for($this->institution)->withIdentity()->create();
        signInSecurityInstitution($this);
        $hash = SocialSecurityNumber::blindIndex($this->nss);

        // El otro registro aparece entre la verificación previa y el guardado.
        StudentSocialSecurity::saving(function () use ($classmate, $hash): void {
            if (DB::table('student_social_security')->where('student_id', $classmate->id)->doesntExist()) {
                DB::table('student_social_security')->insert([
                    'student_id' => $classmate->id, 'institution_id' => $classmate->institution_id,
                    'nss' => Crypt::encryptString($this->nss), 'nss_hash' => $hash, 'created_at' => now(), 'updated_at' => now(),
                ]);
            }
        });

        $this->browserRequest('PUT', securityUrl($this->student), ['nss' => $this->nss])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['nss' => 'Ya existe un alumno con ese NSS en tu institución.']);
        expect(StudentSocialSecurity::where('student_id', $this->student->id)->exists())->toBeFalse();
    });
});

describe('comprobante', function () {
    it('stores the PDF on the private disk with a random name (CA-03)', function () {
        signInSecurityInstitution($this);
        $response = uploadDocument($this, $this->student, pdfUpload('Vigencia IMSS María.pdf'))
            ->assertOk()
            ->assertHeader('Cache-Control', 'no-store, private')
            ->assertJsonPath('data.nss', null)
            ->assertJsonPath('data.document.name', 'Vigencia IMSS María.pdf')
            ->assertJsonPath('data.document.size', strlen("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF\n"));
        expect($response->json('data.document'))->toHaveKeys(['name', 'size', 'uploaded_at'])->toHaveCount(3);

        $record = StudentSocialSecurity::sole();
        expect($record->document_path)->toMatch('#^imss/'.$this->institution->id.'/[0-9a-f-]{36}\.pdf$#');
        expect($record->document_sha256)->toBe(hash('sha256', "%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF\n"));
        Storage::disk('local')->assertExists($record->document_path);
        expect($response->getContent())->not->toContain($record->document_path)->not->toContain('imss/');
    });

    it('keeps the private disk out of the public web root', function () {
        expect(config('filesystems.disks.local.root'))->toBe(storage_path('app/private'));
        expect(config('filesystems.disks.local.serve'))->toBeFalse();
        expect(str_starts_with(storage_path('app/private'), public_path()))->toBeFalse();
    });

    it('keeps the NSS and the document together in the same record', function () {
        signInSecurityInstitution($this);
        $this->browserRequest('PUT', securityUrl($this->student), ['nss' => $this->nss])->assertOk();
        uploadDocument($this, $this->student, pdfUpload())->assertOk()->assertJsonPath('data.nss', $this->nss);
        $this->browserRequest('GET', securityUrl($this->student))->assertOk()
            ->assertJsonPath('data.nss', $this->nss)->assertJsonPath('data.document.name', 'vigencia.pdf');
        $this->assertDatabaseCount('student_social_security', 1);
    });

    it('replaces the previous document and deletes its file', function () {
        signInSecurityInstitution($this);
        uploadDocument($this, $this->student, pdfUpload('anterior.pdf'))->assertOk();
        $previous = StudentSocialSecurity::sole()->document_path;

        uploadDocument($this, $this->student, pdfUpload('nuevo.pdf', "%PDF-1.4\nnuevo\n%%EOF\n"))->assertOk()->assertJsonPath('data.document.name', 'nuevo.pdf');
        $current = StudentSocialSecurity::sole()->document_path;

        expect($current)->not->toBe($previous);
        Storage::disk('local')->assertMissing($previous);
        Storage::disk('local')->assertExists($current);
        expect(Storage::disk('local')->allFiles('imss'))->toHaveCount(1);
    });

    it('removes the new file and keeps the previous one if the record cannot be saved', function () {
        signInSecurityInstitution($this);
        uploadDocument($this, $this->student, pdfUpload('anterior.pdf'))->assertOk();
        $previous = StudentSocialSecurity::sole()->document_path;

        StudentSocialSecurity::saving(fn () => throw new RuntimeException('Fallo de base de datos'));
        $this->withoutExceptionHandling();
        expect(fn () => uploadDocument($this, $this->student, pdfUpload('nuevo.pdf')))->toThrow(RuntimeException::class);

        expect(Storage::disk('local')->allFiles('imss'))->toBe([$previous]);
        expect(StudentSocialSecurity::sole()->document_name)->toBe('anterior.pdf');
    });

    it('rejects anything that is not a real PDF up to 2 MB', function (Closure $file, string $message) {
        signInSecurityInstitution($this);
        uploadDocument($this, $this->student, $file())
            ->assertUnprocessable()->assertJsonValidationErrors(['document' => $message]);
        $this->assertDatabaseCount('student_social_security', 0);
        expect(Storage::disk('local')->allFiles())->toBe([]);
    })->with([
        'text renamed to pdf' => [fn () => pdfUpload('falso.pdf', 'Esto no es un PDF'), 'El comprobante debe ser un archivo PDF.'],
        'html renamed to pdf' => [fn () => pdfUpload('falso.pdf', '<html><script>alert(1)</script></html>'), 'El comprobante debe ser un archivo PDF.'],
        'image' => [fn () => UploadedFile::fake()->createWithContent('foto.png', "\x89PNG\r\n\x1a\n".str_repeat("\0", 32)), 'El comprobante debe ser un archivo PDF.'],
        'pdf with another extension' => [fn () => pdfUpload('vigencia.txt'), 'El comprobante debe ser un archivo PDF.'],
        'too large' => [fn () => pdfUpload('grande.pdf', '%PDF-1.7'.str_repeat('0', 2048 * 1024)), 'El comprobante no debe superar 2 MB.'],
    ]);

    it('requires a file', function () {
        signInSecurityInstitution($this);
        $this->browserRequest('POST', securityUrl($this->student, '/document'), ['document' => 'texto'])
            ->assertUnprocessable()->assertJsonValidationErrors('document');
        $this->browserRequest('POST', securityUrl($this->student, '/document'))
            ->assertUnprocessable()->assertJsonValidationErrors(['document' => 'Selecciona el comprobante de vigencia del IMSS.']);
    });

    it('sanitizes the original name, which is only shown, never used as a path', function () {
        signInSecurityInstitution($this);
        uploadDocument($this, $this->student, pdfUpload('../../etc/passwd.pdf'))->assertOk()->assertJsonPath('data.document.name', 'passwd.pdf');
        expect(StudentSocialSecurity::sole()->document_path)->toStartWith('imss/'.$this->institution->id.'/');
    });

    it('downloads the document as an attachment that browsers do not cache or sniff (CA-03)', function () {
        signInSecurityInstitution($this);
        uploadDocument($this, $this->student, pdfUpload('Vigencia María.pdf'))->assertOk();

        $response = $this->browserRequest('GET', securityUrl($this->student, '/document'))->assertOk()
            ->assertHeader('Content-Type', 'application/pdf')
            ->assertHeader('X-Content-Type-Options', 'nosniff')
            ->assertHeader('Cache-Control', 'no-store, private')
            ->assertDownload('comprobante-imss.pdf');
        expect($response->streamedContent())->toBe("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF\n");
    });

    it('answers 404 when there is no document to download', function () {
        signInSecurityInstitution($this);
        $this->browserRequest('GET', securityUrl($this->student, '/document'))
            ->assertNotFound()->assertExactJson(['message' => 'El alumno no tiene comprobante del IMSS.']);

        $this->browserRequest('PUT', securityUrl($this->student), ['nss' => $this->nss])->assertOk();
        $this->browserRequest('GET', securityUrl($this->student, '/document'))->assertNotFound();
    });
});

describe('aislamiento y privacidad', function () {
    it('answers 404 for a student of another institution or a missing one, without reading or writing (CA-03)', function () {
        $foreignFile = 'imss/'.$this->other->id.'/ajeno.pdf';
        Storage::disk('local')->put($foreignFile, '%PDF-1.7 ajeno');
        $foreignSecurity = new StudentSocialSecurity;
        $foreignSecurity->student_id = $this->foreign->id;
        $foreignSecurity->institution_id = $this->other->id;
        $foreignSecurity->nss = $this->nss;
        $foreignSecurity->document_path = $foreignFile;
        $foreignSecurity->document_sha256 = hash('sha256', '%PDF-1.7 ajeno');
        $foreignSecurity->save();

        signInSecurityInstitution($this);
        foreach ([$this->foreign->id, Student::max('id') + 100] as $id) {
            $this->browserRequest('GET', securityUrl($id))->assertNotFound()->assertExactJson(['message' => 'El alumno no existe.']);
            $this->browserRequest('PUT', securityUrl($id), ['nss' => nssWithCheckDigit('5555555555')])
                ->assertNotFound()->assertExactJson(['message' => 'El alumno no existe.']);
            uploadDocument($this, $id, pdfUpload())->assertNotFound()->assertExactJson(['message' => 'El alumno no existe.']);
            $this->browserRequest('GET', securityUrl($id, '/document'))->assertNotFound()->assertExactJson(['message' => 'El alumno no existe.']);
        }

        expect($foreignSecurity->fresh()->nss)->toBe($this->nss);
        expect($foreignSecurity->fresh()->document_path)->toBe($foreignFile);
        expect(Storage::disk('local')->allFiles())->toBe([$foreignFile]);
        $this->assertDatabaseCount('student_social_security', 1);
    });

    it('answers 404 for malformed or out of range identifiers', function (string $id) {
        signInSecurityInstitution($this);
        $this->browserRequest('GET', '/api/students/'.$id.'/social-security')->assertNotFound();
        $this->browserRequest('GET', '/api/students/'.$id.'/social-security/document')->assertNotFound();
    })->with(['zero' => ['0'], 'negative' => ['-1'], 'text' => ['abc'], 'bigint overflow' => ['99999999999999999999'], 'traversal' => ['..%2F..']]);

    it('never exposes the social security in the roster or the detail (CA-01, CA-02)', function () {
        signInSecurityInstitution($this);
        $this->browserRequest('PUT', securityUrl($this->student), ['nss' => $this->nss])->assertOk();
        uploadDocument($this, $this->student, pdfUpload('Vigencia secreta.pdf'))->assertOk();

        foreach (['/api/students', '/api/students/'.$this->student->id] as $url) {
            $content = $this->browserRequest('GET', $url)->assertOk()->getContent();
            expect($content)->not->toContain($this->nss)->not->toContain('social')->not->toContain('nss')
                ->not->toContain('Vigencia secreta')->not->toContain('imss');
        }
        expect(StudentSocialSecurity::sole()->toArray())->not->toHaveKeys(['nss', 'nss_hash', 'document_path', 'document_sha256']);
    });

    it('only lets INSTITUTION accounts reach the social security', function (UserRole $role) {
        $this->loginWithCookies(User::factory()->role($role)->create())->assertOk();
        $this->browserRequest('GET', securityUrl($this->student))->assertForbidden();
        $this->browserRequest('PUT', securityUrl($this->student), ['nss' => $this->nss])->assertForbidden();
        uploadDocument($this, $this->student, pdfUpload())->assertForbidden();
        $this->browserRequest('GET', securityUrl($this->student, '/document'))->assertForbidden();
        $this->assertDatabaseCount('student_social_security', 0);
    })->with([UserRole::ADMIN, UserRole::COMPANY, UserRole::SECRETARY]);

    it('rejects anonymous requests, accounts without institution and inactive institutions', function () {
        $this->startCookieSession();
        $this->browserRequest('GET', securityUrl($this->student, '/document'))->assertUnauthorized();
        $this->browserRequest('PUT', securityUrl($this->student), ['nss' => $this->nss])->assertUnauthorized();

        $this->loginWithCookies(User::factory()->role(UserRole::INSTITUTION)->create(['institution_id' => null]))->assertOk();
        $this->browserRequest('GET', securityUrl($this->student))->assertForbidden();
        uploadDocument($this, $this->student, pdfUpload())->assertForbidden();

        $this->initializeCookieBrowser();
        signInSecurityInstitution($this);
        $this->institution->forceFill(['is_active' => false])->save();
        $this->browserRequest('GET', securityUrl($this->student))->assertUnauthorized();

        $this->assertDatabaseCount('student_social_security', 0);
        expect(Storage::disk('local')->allFiles())->toBe([]);
    });

    it('requires CSRF to change the social security', function () {
        signInSecurityInstitution($this);
        $this->browserRequest('PUT', securityUrl($this->student), ['nss' => $this->nss], csrf: false)->assertStatus(419);
        $this->browserRequest('POST', securityUrl($this->student, '/document'), csrf: false, files: ['document' => pdfUpload()])->assertStatus(419);
        $this->assertDatabaseCount('student_social_security', 0);
        expect(Storage::disk('local')->allFiles())->toBe([]);
    });

    it('offers no deletion of the social security', function () {
        signInSecurityInstitution($this);
        $this->browserRequest('DELETE', securityUrl($this->student))->assertStatus(405);
        $this->browserRequest('DELETE', securityUrl($this->student, '/document'))->assertStatus(405);
    });
});

describe('base de datos', function () {
    it('classifies the table as protected data and keeps the student and institution consistent', function () {
        expect(DB::selectOne("SELECT obj_description('student_social_security'::regclass) AS comment")->comment)->toContain('Datos protegidos');

        // Composite FK: the record cannot point to a student of another institution.
        expect(fn () => DB::table('student_social_security')->insert([
            'student_id' => $this->foreign->id, 'institution_id' => $this->institution->id, 'created_at' => now(), 'updated_at' => now(),
        ]))->toThrow(QueryException::class);
    });

    it('enforces the NSS uniqueness and the integrity checks in the database', function (array $values) {
        $classmate = Student::factory()->for($this->institution)->withIdentity()->create();
        $hash = SocialSecurityNumber::blindIndex($this->nss);
        DB::table('student_social_security')->insert([
            'student_id' => $classmate->id, 'institution_id' => $this->institution->id,
            'nss' => Crypt::encryptString($this->nss), 'nss_hash' => $hash, 'created_at' => now(), 'updated_at' => now(),
        ]);

        expect(fn () => DB::table('student_social_security')->insert(array_replace([
            'student_id' => $this->student->id, 'institution_id' => $this->institution->id, 'created_at' => now(), 'updated_at' => now(),
        ], $values)))->toThrow(QueryException::class);
    })->with([
        'duplicate hash' => [fn () => ['nss' => 'cifrado', 'nss_hash' => SocialSecurityNumber::blindIndex(nssWithCheckDigit('1234567890'))]],
        'nss without hash' => [['nss' => 'cifrado']],
        'hash without nss' => [['nss_hash' => str_repeat('a', 64)]],
        'malformed hash' => [['nss' => 'cifrado', 'nss_hash' => str_repeat('Z', 64)]],
        'document without checksum' => [['document_path' => 'imss/1/x.pdf']],
    ]);
});
