<?php

use App\Enums\UserRole;
use App\Models\Company;
use App\Models\Institution;
use App\Models\LinkageRequest;
use App\Models\Opportunity;
use App\Models\Student;
use App\Models\User;
use App\Support\CsvExport;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Testing\TestResponse;
use Tests\Support\InteractsWithCookieSessions;

// HU-S7-02: exportación en CSV del reporte ejecutivo y de la bandeja institucional.
uses(RefreshDatabase::class, InteractsWithCookieSessions::class);

const CSV_REPORT = '/api/reports/dual-program/export.csv';
const CSV_INBOX = '/api/institution/linkage-requests/export.csv';
const CSV_INBOX_HEADER = ['Folio', 'Fecha de solicitud', 'Estado', 'Matrícula', 'Primer apellido', 'Segundo apellido', 'Nombre(s)', 'Carrera',
    'Empresa', 'Contacto de la empresa', 'Correo de contacto', 'Teléfono de contacto', 'Oportunidad', 'Fecha de respuesta'];

beforeEach(function () {
    $this->initializeCookieBrowser();
});

function csvStudent(Institution $institution, array $identity = [], ?string $program = 'Ingeniería Mecatrónica'): Student
{
    $student = Student::factory()->for($institution)->withIdentity($identity)->create();
    DB::table('students')->where('id', $student->id)->update(['program' => $program]);

    return $student->fresh();
}

function csvLinkage(Company $company, Student $student, string $status = 'PENDIENTE_INSTITUCION', string $title = 'Tableros de producción'): LinkageRequest
{
    $opportunity = new Opportunity([
        'title' => $title, 'program' => 'Ingeniería Mecatrónica', 'period_type' => 'semester', 'period_number' => 5,
        'vacancies' => 2, 'can_relocate' => false, 'state_code' => '28', 'municipality_code' => '28032', 'description' => 'Actividades.',
    ]);
    $opportunity->company_id = $company->id;
    $opportunity->created_by = User::factory()->forCompany($company)->create()->id;
    $opportunity->location = DB::raw("(SELECT location FROM municipalities WHERE code = '28032')");
    $opportunity->is_active = false;
    $opportunity->save();

    $linkage = new LinkageRequest;
    $linkage->company_id = $company->id;
    $linkage->opportunity_id = $opportunity->id;
    $linkage->student_id = $student->id;
    $linkage->institution_id = $student->institution_id;
    $linkage->requested_by = $opportunity->created_by;
    $linkage->status = $status;
    $linkage->save();

    return $linkage;
}

/** Filas del CSV, sin el BOM; los bloques se separan con una fila vacía (['']). */
function csvRows(TestResponse $response): array
{
    $content = $response->streamedContent();
    expect(str_starts_with($content, "\u{FEFF}"))->toBeTrue();
    $lines = explode("\r\n", rtrim(substr($content, 3), "\r\n"));

    return array_map(fn (string $line): array => $line === '' ? [''] : str_getcsv($line, ',', '"', ''), $lines);
}

function csvAssertDownload(TestResponse $response, string $prefix): void
{
    $response->assertOk()
        ->assertHeader('Content-Type', 'text/csv; charset=UTF-8')
        ->assertHeader('Content-Disposition', 'attachment; filename='.$prefix.'-'.now()->format('Y-m-d').'.csv')
        ->assertHeader('X-Content-Type-Options', 'nosniff')
        ->assertHeader('Cache-Control', 'no-store, private');
}

function csvInstitutionUser(?Institution $institution = null): User
{
    return User::factory()->forInstitution($institution ?? Institution::factory()->create())->create();
}

it('neutralizes text that a spreadsheet would run as a formula (CA-03)', function (string $value, string $expected) {
    expect(CsvExport::neutralize($value))->toBe($expected);
})->with([
    'equals' => ['=HYPERLINK("http://x")', '\'=HYPERLINK("http://x")'],
    'plus' => ['+52 899 123 4567', "'+52 899 123 4567"],
    'minus' => ['-2+3', "'-2+3"],
    'at' => ['@SUM(A1)', "'@SUM(A1)"],
    'tab' => ["\t=1", "'\t=1"],
    'carriage return' => ["\r=1", "'\r=1"],
    'plain text' => ['Universidad Tecnológica', 'Universidad Tecnológica'],
    'inner equals' => ['a=b', 'a=b'],
    'empty' => ['', ''],
]);

it('keeps numbers, booleans and nulls readable (CA-03)', function () {
    expect(CsvExport::neutralize(-5))->toBe(-5)
        ->and(CsvExport::neutralize(null))->toBe('')
        ->and(CsvExport::neutralize(true))->toBe('Sí');
});

describe('executive report export (CA-01)', function () {
    it('rejects visitors', function () {
        $this->browserRequest('GET', CSV_REPORT)->assertUnauthorized();
    });

    it('allows only ADMIN and SECRETARY', function (UserRole $role, int $status) {
        $user = match ($role) {
            UserRole::INSTITUTION => csvInstitutionUser(),
            UserRole::COMPANY => User::factory()->forCompany()->create(),
            default => User::factory()->role($role)->create(),
        };
        $this->loginWithCookies($user)->assertOk();

        $this->browserRequest('GET', CSV_REPORT)->assertStatus($status);
    })->with([
        'ADMIN' => [UserRole::ADMIN, 200],
        'SECRETARY' => [UserRole::SECRETARY, 200],
        'INSTITUTION' => [UserRole::INSTITUTION, 403],
        'COMPANY' => [UserRole::COMPANY, 403],
    ]);

    it('downloads the institution and SCIAN sector breakdown without student data', function () {
        $tech = Institution::factory()->create(['name' => 'Universidad Tecnológica']);
        Institution::factory()->inactive()->create(['name' => '=HYPERLINK("http://malicioso")']);
        $student = csvStudent($tech, ['enrollment_number' => 'MAT2026X', 'given_names' => 'Ximena', 'first_surname' => 'Zaragoza']);
        $company = Company::factory()->create(['sector_code' => '31-33', 'legal_name' => 'Manufacturas del Golfo']);
        csvLinkage($company, $student, 'ACEPTADA');
        csvLinkage($company, $student);
        $this->loginWithCookies(User::factory()->role(UserRole::SECRETARY)->create())->assertOk();

        $response = $this->browserRequest('GET', CSV_REPORT);
        csvAssertDownload($response, 'reporte-educacion-dual');

        expect(csvRows($response))->toBe([
            ['Institución', 'Estado', 'Alumnos activos', 'Perfiles buscables', 'Solicitudes recibidas', 'Solicitudes aceptadas'],
            ['\'=HYPERLINK("http://malicioso")', 'Inactiva', '0', '0', '0', '0'],
            ['Universidad Tecnológica', 'Activa', '1', '0', '2', '1'],
            [''],
            ['Código SCIAN', 'Sector', 'Empresas activas', 'Oportunidades activas', 'Solicitudes aceptadas'],
            ['31-33', 'Industrias manufactureras', '1', '0', '1'],
        ]);
        foreach (['MAT2026X', 'Ximena', 'Zaragoza', $student->public_id, 'Manufacturas del Golfo', 'dual@empresa.test'] as $secret) {
            expect($response->streamedContent())->not->toContain($secret);
        }
    });
});

describe('institution inbox export (CA-02)', function () {
    it('rejects visitors and every other role', function () {
        $this->browserRequest('GET', CSV_INBOX)->assertUnauthorized();

        foreach ([User::factory()->role(UserRole::ADMIN)->create(), User::factory()->role(UserRole::SECRETARY)->create(),
            User::factory()->forCompany()->create(), User::factory()->create(['institution_id' => null])] as $user) {
            $this->loginWithCookies($user)->assertOk();
            $this->browserRequest('GET', CSV_INBOX)->assertForbidden();
            $this->browserRequest('POST', '/api/logout');
        }
    });

    it('rejects the accounts of an inactive institution', function () {
        $institution = Institution::factory()->create();
        $this->loginWithCookies(csvInstitutionUser($institution))->assertOk();
        $institution->forceFill(['is_active' => false])->save();

        $this->browserRequest('GET', CSV_INBOX)->assertUnauthorized()->assertJsonPath('code', 'INSTITUTION_INACTIVE');
    });

    it('downloads only the requests of its own institution, newest first, without the NSS', function () {
        $institution = Institution::factory()->create();
        $student = csvStudent($institution, ['enrollment_number' => 'MAT-001', 'given_names' => 'Ana Sofía', 'first_surname' => 'López', 'second_surname' => 'Ríos']);
        $company = Company::factory()->create([
            'legal_name' => 'Manufacturas del Golfo, S.A. de C.V.', 'trade_name' => 'ManuGolfo',
            'contact_name' => '=cmd|calc', 'contact_email' => 'rh@manugolfo.test', 'contact_phone' => '+52 899 123 4567',
        ]);
        $plain = Company::factory()->create(['legal_name' => 'Servicios Industriales, S.C.', 'trade_name' => null, 'contact_phone' => null]);

        Carbon::setTestNow('2026-10-20 18:30:00');
        $older = csvLinkage($plain, $student, 'PENDIENTE_INSTITUCION', 'Mantenimiento');
        Carbon::setTestNow('2026-10-27 16:05:00');
        $newer = csvLinkage($company, $student, 'ACEPTADA');
        $newer->forceFill(['responded_at' => '2026-10-28 01:15:00', 'responded_by' => csvInstitutionUser($institution)->id])->save();
        Carbon::setTestNow();

        // Solicitud de otra institución con el mismo alumno de nombre: nunca aparece.
        csvLinkage($company, csvStudent(Institution::factory()->create(), ['enrollment_number' => 'AJENO-99']));
        DB::table('student_social_security')->insert(['student_id' => $student->id, 'institution_id' => $institution->id,
            'nss' => encrypt('12345678903', false), 'nss_hash' => str_repeat('a', 64), 'created_at' => now(), 'updated_at' => now()]);

        $this->loginWithCookies(csvInstitutionUser($institution))->assertOk();
        $response = $this->browserRequest('GET', CSV_INBOX);
        csvAssertDownload($response, 'solicitudes-vinculacion');

        expect(csvRows($response))->toBe([
            CSV_INBOX_HEADER,
            [(string) $newer->id, '2026-10-27 10:05', 'Aceptada', 'MAT-001', 'López', 'Ríos', 'Ana Sofía', 'Ingeniería Mecatrónica',
                'ManuGolfo', "'=cmd|calc", 'rh@manugolfo.test', "'+52 899 123 4567", 'Tableros de producción', '2026-10-27 19:15'],
            [(string) $older->id, '2026-10-20 12:30', 'Pendiente de la institución', 'MAT-001', 'López', 'Ríos', 'Ana Sofía', 'Ingeniería Mecatrónica',
                'Servicios Industriales, S.C.', 'Responsable del programa dual', 'dual@empresa.test', '', 'Mantenimiento', ''],
        ]);
        expect($response->streamedContent())->not->toContain('AJENO-99')->not->toContain('12345678903')->not->toContain(str_repeat('a', 64));
    });

    it('applies the optional status filter and validates it', function () {
        $institution = Institution::factory()->create();
        $student = csvStudent($institution);
        $company = Company::factory()->create();
        $accepted = csvLinkage($company, $student, 'ACEPTADA');
        csvLinkage($company, $student, 'RECHAZADA');
        $this->loginWithCookies(csvInstitutionUser($institution))->assertOk();

        $rows = csvRows($this->browserRequest('GET', CSV_INBOX.'?status=ACEPTADA')->assertOk());
        expect($rows)->toHaveCount(2)->and($rows[1][0])->toBe((string) $accepted->id);

        expect(csvRows($this->browserRequest('GET', CSV_INBOX.'?status=CANCELADA')->assertOk()))->toBe([CSV_INBOX_HEADER]);

        $this->browserRequest('GET', CSV_INBOX.'?status=aceptada', headers: ['Accept' => 'application/json'])
            ->assertUnprocessable()->assertJsonValidationErrors(['status' => 'El estado no es válido.']);
    });

    it('keeps the institution inbox and detail routes working next to the export', function () {
        $institution = Institution::factory()->create();
        $linkage = csvLinkage(Company::factory()->create(), csvStudent($institution));
        $this->loginWithCookies(csvInstitutionUser($institution))->assertOk();

        $this->browserRequest('GET', '/api/institution/linkage-requests/'.$linkage->id)->assertOk()->assertJsonPath('data.id', $linkage->id);
        $this->browserRequest('GET', '/api/institution/linkage-requests/export')->assertNotFound();
    });
});
