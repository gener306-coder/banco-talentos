<?php

namespace App\Support\Simulation;

use App\Enums\LinkageRequestStatus;
use App\Enums\MexicanState;
use App\Support\CatalogSlug;
use App\Support\SocialSecurityNumber;
use Carbon\CarbonImmutable;
use Closure;
use Illuminate\Contracts\Database\Query\Expression;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Random\Engine\Mt19937;
use Random\Randomizer;

/**
 * Genera un volumen realista de datos aleatorios para la simulación de carga (tarea transversal). Inserta por lotes
 * directamente en PostgreSQL respetando todas las restricciones del esquema, y calcula las ubicaciones con el
 * catálogo INEGI igual que la aplicación. Con la misma semilla produce los mismos datos.
 */
final class SimulationDataset
{
    public const DOMAIN = 'sim.test';

    private const MAX_PARAMETERS = 60000;

    private Randomizer $random;

    private CarbonImmutable $now;

    private CarbonImmutable $start;

    private string $passwordHash;

    /** @var array<string, list<array{code: string, name: string}>> municipios por estado */
    private array $municipalities = [];

    /** @var array<string, int> slug → id */
    private array $skills = [];

    /** @var array<string, list<string>> área → slugs técnicos */
    private array $areaSkills = [];

    /** @var list<string> */
    private array $softSkills = [];

    /**
     * @param  array{institutions: int, students: int, companies: int, opportunities: int, linkages: int, state: string, seed: int}  $options
     */
    public function __construct(private readonly array $options, private readonly ?Closure $progress = null)
    {
        $this->random = new Randomizer(new Mt19937($options['seed']));
        $this->now = CarbonImmutable::now()->startOfMinute();
        $this->start = $this->now->subMonths(6);
    }

    /** @return array{admin: string, secretary: string, institution: string, company: string} correos de demostración */
    public function run(string $password): array
    {
        $this->passwordHash = Hash::make($password);
        $this->loadMunicipalities();

        return DB::transaction(function (): array {
            $admin = $this->createAdmin();
            $secretaries = $this->createSecretaries($admin);
            $institutions = $this->createInstitutions($admin);
            $this->createSkills();
            $students = $this->createStudents($institutions);
            $companies = $this->createCompanies($secretaries);
            $opportunities = $this->createOpportunities($companies);
            $this->createLinkages($students, $institutions, $companies, $opportunities);

            return [
                'admin' => 'admin@'.self::DOMAIN,
                'secretary' => 'secretaria01@'.self::DOMAIN,
                'institution' => 'institucion01-1@'.self::DOMAIN,
                'company' => 'empresa001-1@'.self::DOMAIN,
            ];
        });
    }

    private function loadMunicipalities(): void
    {
        foreach (DB::table('municipalities')->orderBy('code')->get(['code', 'state_code', 'name']) as $row) {
            $this->municipalities[$row->state_code][] = ['code' => $row->code, 'name' => $row->name];
        }
        if (! isset($this->municipalities[$this->options['state']])) {
            throw new \RuntimeException("El estado {$this->options['state']} no tiene municipios en el catálogo.");
        }
    }

    private function createAdmin(): int
    {
        return $this->insertUsers([$this->user('Administración del Banco de Talentos', 'admin', 'ADMIN', $this->start->subMonth())])[0];
    }

    /** @return list<int> */
    private function createSecretaries(int $admin): array
    {
        $rows = [];
        for ($i = 1; $i <= 8; $i++) {
            $rows[] = $this->user($this->personName().' (Secretaría)', sprintf('secretaria%02d', $i), 'SECRETARY',
                $this->start->subDays(25 - $i), ['created_by' => $admin]);
        }
        $this->report('Cuentas de la Secretaría', count($rows));

        return $this->insertUsers($rows);
    }

    /** @return array<int, array{active: bool, created: CarbonImmutable, users: list<int>, prefix: string}> */
    private function createInstitutions(int $admin): array
    {
        $state = $this->options['state'];
        $towns = $this->random->shuffleArray($this->municipalities[$state]);
        $institutions = [];

        for ($i = 1; $i <= $this->options['institutions']; $i++) {
            [$label, $prefix, $cctType] = SimulationCatalog::INSTITUTION_TYPES[($i - 1) % count(SimulationCatalog::INSTITUTION_TYPES)];
            $town = $towns[($i - 1) % count($towns)]['name'];
            $created = $this->start->addDays($i);
            $active = $i < $this->options['institutions'] || $this->options['institutions'] === 1;
            $id = $this->insertReturning('institutions', [[
                'name' => "{$label} {$town}",
                'cct' => sprintf('%s%s%04d%s', $state, $cctType, $i, chr(65 + $i % 26)),
                'contact_email' => sprintf('vinculacion@inst%02d.%s', $i, self::DOMAIN),
                'is_active' => $active,
                'created_at' => $created,
                'updated_at' => $created,
            ]])[0];

            $users = [];
            $accounts = $this->random->getInt(2, 4);
            for ($k = 1; $k <= $accounts; $k++) {
                // La primera cuenta de cada institución siempre está configurada: es la de demostración.
                $pending = $k > 1 && $this->chance(0.1);
                $users[] = $this->user($this->personName(), sprintf('institucion%02d-%d', $i, $k), 'INSTITUTION',
                    $created->addHours($k), ['institution_id' => $id, 'created_by' => $admin, 'password_setup_required' => $pending]);
            }
            $ids = $this->insertUsers($users);
            $configured = array_values(array_filter($ids, fn (int $user, int $index) => ! $users[$index]['password_setup_required'], ARRAY_FILTER_USE_BOTH));
            $institutions[$id] = ['active' => $active, 'created' => $created, 'users' => $configured, 'prefix' => $prefix.str_pad((string) $i, 2, '0', STR_PAD_LEFT)];
        }
        $this->report('Instituciones', count($institutions));

        return $institutions;
    }

    private function createSkills(): void
    {
        $rows = [];
        foreach (SimulationCatalog::TECHNICAL_SKILLS as $area => $names) {
            foreach ($names as $name) {
                $slug = CatalogSlug::from($name);
                $this->areaSkills[$area][] = $slug;
                $rows[$slug] ??= ['name' => $name, 'slug' => $slug, 'kind' => 'technical', 'created_at' => $this->start, 'updated_at' => $this->start];
            }
        }
        foreach (SimulationCatalog::SOFT_SKILLS as $name) {
            $slug = CatalogSlug::from($name);
            $this->softSkills[] = $slug;
            $rows[$slug] = ['name' => $name, 'slug' => $slug, 'kind' => 'soft', 'created_at' => $this->start, 'updated_at' => $this->start];
        }
        $ids = $this->insertReturning('skills', array_values($rows));
        $this->skills = array_combine(array_keys($rows), $ids);
        $this->report('Habilidades del catálogo', count($ids));
    }

    /**
     * Alumnos con su identidad, expediente, CV y seguro. Devuelve los buscables de instituciones activas, que son
     * los únicos que una empresa puede solicitar.
     *
     * @return array<string, list<array{id: int, institution: int, created: CarbonImmutable}>> buscables por carrera
     */
    private function createStudents(array $institutions): array
    {
        $searchable = [];
        $total = 0;

        foreach ($institutions as $institutionId => $institution) {
            $count = max(1, (int) round($this->options['students'] * $this->random->getFloat(0.6, 1.4)));
            for ($offset = 0; $offset < $count; $offset += 1000) {
                $batch = [];
                for ($n = $offset; $n < min($count, $offset + 1000); $n++) {
                    $batch[] = $this->studentProfile($institutionId, $institution, $n);
                }
                $ids = $this->insertReturning('students', array_map(fn (array $item) => $item['row'], $batch));
                $this->insertStudentDetails($institutionId, $institution, $batch, $ids);

                foreach ($batch as $index => $item) {
                    if ($item['searchable'] && $institution['active']) {
                        $searchable[$item['row']['program']][] = ['id' => $ids[$index], 'institution' => $institutionId, 'created' => $item['row']['created_at']];
                    }
                }
                $total += count($batch);
            }
        }

        // Ubicación aproximada igual que StudentController::locate(): cabecera del municipio o punto del estado.
        DB::update('UPDATE students SET location = m.location FROM municipalities m WHERE students.location IS NULL AND m.code = students.municipality_code');
        foreach (MexicanState::cases() as $state) {
            [$latitude, $longitude] = $state->referencePoint();
            DB::update('UPDATE students SET location = ST_SetSRID(ST_MakePoint(?, ?), 4326)::geography
                WHERE location IS NULL AND municipality_code IS NULL AND legacy_municipality IS NOT NULL AND state_code = ?', [$longitude, $latitude, $state->value]);
        }
        $this->report('Alumnos', $total);

        return $searchable;
    }

    /** @return array{row: array<string, mixed>, searchable: bool, cv: bool, area: string, identity: array<string, string|null>} */
    private function studentProfile(int $institutionId, array $institution, int $index): array
    {
        $area = $this->weighted(SimulationCatalog::AREA_WEIGHTS);
        $created = $this->between($institution['created'], $this->now->subDay());
        $kind = $this->random->getFloat(0, 1);
        $complete = $kind < 0.70;
        $partial = ! $complete && $kind < 0.90;
        $active = $this->chance(0.95);
        $legacy = $complete && $this->chance(0.03);
        [$state, $municipality] = $this->location();
        $fourMonth = $this->chance(0.35);

        $row = [
            'institution_id' => $institutionId,
            'is_active' => $active,
            'program' => null, 'period_type' => null, 'period_number' => null, 'dual_available' => null,
            'state_code' => null, 'municipality_code' => null, 'legacy_municipality' => null, 'can_relocate' => null,
            'headline' => null,
            'created_at' => $created,
            'updated_at' => $this->between($created, $this->now),
        ];
        if ($complete || $partial) {
            $row['program'] = $this->pick(SimulationCatalog::PROGRAMS[$area]);
            $row['period_type'] = $fourMonth ? 'four_month' : 'semester';
            $row['period_number'] = $this->random->getInt(1, $fourMonth ? 11 : 9);
        }
        if ($complete) {
            $row['dual_available'] = $this->chance(0.8);
            $row['can_relocate'] = $this->chance(0.3);
            $row['state_code'] = $state;
            $row['municipality_code'] = $legacy ? null : $municipality['code'];
            $row['legacy_municipality'] = $legacy ? 'Col. '.$municipality['name'] : null;
            $row['headline'] = $this->chance(0.85) ? $this->pick(SimulationCatalog::HEADLINES[$area]) : null;
        }

        $secondSurname = $this->chance(0.9) ? $this->pick(SimulationCatalog::SURNAMES) : null;

        return [
            'row' => $row,
            'searchable' => $complete && $active,
            'cv' => $complete || ($partial && $this->chance(0.3)),
            'area' => $area,
            'identity' => [
                'enrollment_number' => sprintf('%s%02d%05d', $institution['prefix'], (int) $created->format('y'), $index + 1),
                'given_names' => $this->pick(SimulationCatalog::GIVEN_NAMES),
                'first_surname' => $this->pick(SimulationCatalog::SURNAMES),
                'second_surname' => $secondSurname,
            ],
        ];
    }

    private function insertStudentDetails(int $institutionId, array $institution, array $batch, array $ids): void
    {
        $identities = $skills = $languages = $certifications = $projects = $links = $security = [];
        $nssTaken = [];

        foreach ($batch as $index => $item) {
            $studentId = $ids[$index];
            $created = $item['row']['created_at'];
            $owner = ['student_id' => $studentId, 'institution_id' => $institutionId];
            $identities[] = [...$owner, ...$item['identity'], 'created_at' => $created, 'updated_at' => $created];

            if ($item['cv']) {
                $technical = $this->sample($this->areaSkills[$item['area']], $this->random->getInt(1, 6));
                $soft = $this->sample($this->softSkills, $this->random->getInt(0, 2));
                foreach ([...$technical, ...$soft] as $position => $slug) {
                    $skills[] = [...$owner, 'skill_id' => $this->skills[$slug], 'position' => $position];
                }

                $position = 0;
                if ($this->chance(0.3)) {
                    $languages[] = [...$owner, 'language_code' => 'es', 'level' => 7, 'position' => $position++];
                }
                if ($this->chance(0.7)) {
                    $languages[] = [...$owner, 'language_code' => 'en', 'level' => $this->weighted([1 => 15, 2 => 25, 3 => 30, 4 => 20, 5 => 8, 6 => 2]), 'position' => $position++];
                }
                if ($this->chance(0.12)) {
                    $languages[] = [...$owner, 'language_code' => $this->pick(['fr', 'de', 'pt', 'it', 'ja', 'zh']), 'level' => $this->random->getInt(1, 3), 'position' => $position];
                }

                $certificationCount = $this->weighted([0 => 55, 1 => 32, 2 => 13]);
                $pool = SimulationCatalog::CERTIFICATIONS[$item['area']];
                foreach ($this->sample($pool, $certificationCount) as $position => [$name, $issuer]) {
                    $issued = $this->between($this->now->subYears(3), $created);
                    $verified = $institution['users'] !== [] && $this->chance(0.3);
                    $certifications[] = [...$owner, 'name' => $name, 'issuer' => $issuer, 'issuer_slug' => CatalogSlug::from($issuer),
                        'issued_on' => $issued->toDateString(), 'expires_on' => $this->chance(0.3) ? $issued->addYears(2)->toDateString() : null,
                        'verified_at' => $verified ? $this->between($created, $this->now) : null,
                        'verified_by' => $verified ? $this->pick($institution['users']) : null,
                        'position' => $position, 'created_at' => $created, 'updated_at' => $created];
                }

                foreach ($this->sample(SimulationCatalog::PROJECTS[$item['area']], $this->chance(0.55) ? $this->random->getInt(1, 2) : 0) as $position => $title) {
                    $projects[] = [...$owner, 'title' => $title,
                        'description' => 'Proyecto académico desarrollado en equipo durante la carrera, con entregables evaluados por la institución.',
                        'role' => $this->pick(SimulationCatalog::ROLES), 'year' => $this->random->getInt(2023, 2026),
                        'position' => $position, 'created_at' => $created, 'updated_at' => $created];
                }

                if ($this->chance(0.15)) {
                    $links[] = [...$owner, 'kind' => 'linkedin', 'url' => sprintf('https://www.linkedin.com/in/perfil-%d', $studentId),
                        'position' => 0, 'created_at' => $created, 'updated_at' => $created];
                }
            }

            if ($this->chance(0.6)) {
                do {
                    $nss = $this->nss();
                } while (isset($nssTaken[$nss]));
                $nssTaken[$nss] = true;
                $security[] = [...$owner, 'nss' => Crypt::encryptString($nss), 'nss_hash' => SocialSecurityNumber::blindIndex($nss),
                    'created_at' => $created, 'updated_at' => $created];
            }
        }

        $this->insertMany('student_identities', $identities);
        $this->insertMany('student_skills', $skills);
        $this->insertMany('student_languages', $languages);
        $certificationIds = $this->insertReturning('student_certifications', $certifications);
        $credentials = [];
        foreach ($certifications as $index => $certification) {
            if ($this->chance(0.2)) {
                $credentials[] = ['certification_id' => $certificationIds[$index], 'student_id' => $certification['student_id'],
                    'institution_id' => $certification['institution_id'], 'credential_id' => sprintf('CRED-%08d', $certificationIds[$index]),
                    'credential_url' => null, 'verifiable' => false, 'created_at' => $certification['created_at'], 'updated_at' => $certification['created_at']];
            }
        }
        $this->insertMany('student_certification_credentials', $credentials);
        $this->insertMany('student_projects', $projects);
        $this->insertMany('student_links', $links);
        $this->insertMany('student_social_security', $security);
    }

    /** @return array<int, array{active: bool, created: CarbonImmutable, sector: string, users: list<int>, state: string, municipality: string}> */
    private function createCompanies(array $secretaries): array
    {
        $companies = [];
        $rfcs = [];
        for ($i = 1; $i <= $this->options['companies']; $i++) {
            $sector = $this->weighted(SimulationCatalog::SECTOR_WEIGHTS);
            [$state, $municipality] = $this->location();
            $created = $this->between($this->start->addDays(20), $this->now->subDays(20));
            $name = $this->pick(SimulationCatalog::COMPANY_WORDS).' '.$this->pick(SimulationCatalog::COMPANY_NAMES);
            do {
                $rfc = strtoupper(substr(CatalogSlug::from(str_replace(' ', '', $name)), 0, 3)).$created->format('ymd').strtoupper(substr(bin2hex($this->random->getBytes(2)), 0, 3));
                $rfc = preg_replace('/[^A-Z0-9Ñ&]/', 'X', $rfc);
            } while (isset($rfcs[$rfc]));
            $rfcs[$rfc] = true;
            $registeredBy = $this->pick($secretaries);
            $active = $this->chance(0.9);

            $id = $this->insertReturning('companies', [[
                'legal_name' => $name.', '.$this->pick(SimulationCatalog::COMPANY_SUFFIXES),
                'trade_name' => $this->chance(0.7) ? $name : null,
                'rfc' => $rfc,
                'sector_code' => $sector,
                'state_code' => $state,
                'municipality_code' => $municipality['code'],
                'location' => DB::raw("(SELECT location FROM municipalities WHERE code = '{$municipality['code']}')"),
                'contact_name' => $this->personName(),
                'contact_email' => sprintf('dual@empresa%03d.%s', $i, self::DOMAIN),
                'contact_phone' => $this->chance(0.6) ? sprintf('+52 722 %03d %04d', $this->random->getInt(100, 999), $this->random->getInt(0, 9999)) : null,
                'validation_reference' => $this->chance(0.5) ? sprintf('SE-2026-%04d', $i) : null,
                'is_active' => $active,
                'registered_by' => $registeredBy,
                'created_at' => $created,
                'updated_at' => $created,
            ]])[0];

            $users = [];
            $accounts = $this->random->getInt(1, 3);
            for ($k = 1; $k <= $accounts; $k++) {
                $users[] = $this->user($this->personName(), sprintf('empresa%03d-%d', $i, $k), 'COMPANY',
                    $created->addHours($k), ['company_id' => $id, 'created_by' => $registeredBy]);
            }
            $companies[$id] = ['active' => $active, 'created' => $created, 'sector' => $sector, 'users' => $this->insertUsers($users),
                'state' => $state, 'municipality' => $municipality['code']];
        }
        // La empresa de demostración siempre está activa.
        $first = array_key_first($companies);
        DB::table('companies')->where('id', $first)->update(['is_active' => true]);
        $companies[$first]['active'] = true;
        $this->report('Empresas', count($companies));

        return $companies;
    }

    /** @return array<int, array{company: int, program: string, created: CarbonImmutable}> oportunidades activas de empresas activas */
    private function createOpportunities(array $companies): array
    {
        $rows = $skills = $meta = [];
        $companyIds = array_keys($companies);
        for ($i = 0; $i < $this->options['opportunities']; $i++) {
            // Cada empresa recibe al menos una antes de repartir el resto al azar.
            $companyId = $i < count($companyIds) ? $companyIds[$i] : $this->pick($companyIds);
            $company = $companies[$companyId];
            $area = $this->pick(SimulationCatalog::SECTOR_AREAS[$company['sector']] ?? ['business']);
            $created = $this->between($company['created'], $this->now->subDays(5));
            $fourMonth = $this->chance(0.3);
            $language = $this->chance(0.3);
            $rows[] = [
                'company_id' => $companyId,
                'title' => $this->pick(SimulationCatalog::OPPORTUNITY_TITLES[$area]),
                'program' => $this->pick(SimulationCatalog::PROGRAMS[$area]),
                'period_type' => $fourMonth ? 'four_month' : 'semester',
                'period_number' => $this->random->getInt(3, $fourMonth ? 9 : 8),
                'vacancies' => $this->weighted([1 => 30, 2 => 30, 3 => 20, 5 => 12, 10 => 8]),
                'can_relocate' => $this->chance(0.2),
                'state_code' => $company['state'],
                'municipality_code' => $company['municipality'],
                'location' => DB::raw("(SELECT location FROM municipalities WHERE code = '{$company['municipality']}')"),
                'description' => 'Participación en proyectos reales del área con acompañamiento de un mentor de la empresa y objetivos de aprendizaje acordados con la institución.',
                'language_code' => $language ? 'en' : null,
                'min_level' => $language ? $this->random->getInt(2, 5) : null,
                'is_active' => $this->chance(0.8),
                'created_by' => $this->pick($company['users']),
                'created_at' => $created,
                'updated_at' => $created,
            ];
            $meta[] = ['area' => $area, 'company' => $companyId];
        }
        $ids = $this->insertReturning('opportunities', $rows);

        $active = [];
        foreach ($ids as $index => $id) {
            $pool = $this->areaSkills[$meta[$index]['area']];
            foreach ($this->sample($pool, $this->random->getInt(2, 5)) as $position => $slug) {
                $skills[] = ['opportunity_id' => $id, 'skill_id' => $this->skills[$slug], 'position' => $position];
            }
            if ($rows[$index]['is_active'] && $companies[$meta[$index]['company']]['active']) {
                $active[$id] = ['company' => $meta[$index]['company'], 'program' => $rows[$index]['program'], 'created' => $rows[$index]['created_at']];
            }
        }
        $this->insertMany('opportunity_skills', $skills);
        $this->report('Oportunidades', count($ids));

        return $active;
    }

    /** Solicitudes sobre perfiles buscables y oportunidades activas, sin repetir empresa, alumno y oportunidad. */
    private function createLinkages(array $students, array $institutions, array $companies, array $opportunities): void
    {
        if ($students === [] || $opportunities === []) {
            $this->report('Solicitudes de vinculación', 0);

            return;
        }
        $everyone = array_merge(...array_values($students));
        $opportunityIds = array_keys($opportunities);
        $taken = [];
        $rows = [];
        $attempts = 0;

        while (count($rows) < $this->options['linkages'] && $attempts++ < $this->options['linkages'] * 5) {
            $opportunityId = $this->pick($opportunityIds);
            $opportunity = $opportunities[$opportunityId];
            // El 60 % de las solicitudes busca un alumno de la misma carrera que pide la oportunidad.
            $pool = isset($students[$opportunity['program']]) && $this->chance(0.6) ? $students[$opportunity['program']] : $everyone;
            $student = $this->pick($pool);
            $key = $opportunity['company'].'-'.$student['id'].'-'.$opportunityId;
            if (isset($taken[$key])) {
                continue;
            }
            $taken[$key] = true;

            $created = $this->between(max($opportunity['created'], $student['created']), $this->now->subHour());
            $status = $this->weighted(['PENDIENTE_INSTITUCION' => 45, 'ACEPTADA' => 30, 'RECHAZADA' => 15, 'CANCELADA' => 10]);
            $responders = $institutions[$student['institution']]['users'];
            $answered = in_array($status, ['ACEPTADA', 'RECHAZADA'], true) && $responders !== [];
            if (in_array($status, ['ACEPTADA', 'RECHAZADA'], true) && ! $answered) {
                $status = LinkageRequestStatus::PENDING_INSTITUTION->value;
            }
            $respondedAt = $answered ? min($created->addHours($this->random->getInt(2, 24 * 14)), $this->now) : null;

            $rows[] = [
                'company_id' => $opportunity['company'],
                'opportunity_id' => $opportunityId,
                'student_id' => $student['id'],
                'institution_id' => $student['institution'],
                'requested_by' => $this->pick($companies[$opportunity['company']]['users']),
                'message' => $this->chance(0.7) ? $this->pick(SimulationCatalog::LINKAGE_MESSAGES) : null,
                'status' => $status,
                'responded_by' => $answered ? $this->pick($responders) : null,
                'responded_at' => $respondedAt,
                'response_message' => $answered && $this->chance(0.6) ? $this->pick(SimulationCatalog::RESPONSE_MESSAGES) : null,
                'created_at' => $created,
                'updated_at' => $respondedAt ?? ($status === 'CANCELADA' ? min($created->addDays(2), $this->now) : $created),
            ];
        }
        $this->insertMany('linkage_requests', $rows);
        $this->report('Solicitudes de vinculación', count($rows));
    }

    private function user(string $name, string $local, string $role, CarbonImmutable $created, array $extra = []): array
    {
        return [
            'name' => $name,
            'email' => $local.'@'.self::DOMAIN,
            'password' => $this->passwordHash,
            'role' => $role,
            'is_active' => true,
            'password_setup_required' => false,
            'institution_id' => null,
            'company_id' => null,
            'created_by' => null,
            'created_at' => $created,
            'updated_at' => $created,
            ...$extra,
        ];
    }

    /** @return list<int> */
    private function insertUsers(array $rows): array
    {
        return $this->insertReturning('users', $rows);
    }

    /** Estado y municipio: 85 % en el estado principal y el resto en estados vecinos. */
    private function location(): array
    {
        $state = $this->options['state'];
        if ($this->chance(0.15)) {
            $neighbors = SimulationCatalog::NEIGHBOR_STATES[$state] ?? array_values(array_diff(array_keys($this->municipalities), [$state]));
            $state = $this->pick($neighbors);
        }

        return [$state, $this->pick($this->municipalities[$state])];
    }

    private function personName(): string
    {
        return $this->pick(SimulationCatalog::GIVEN_NAMES).' '.$this->pick(SimulationCatalog::SURNAMES).' '.$this->pick(SimulationCatalog::SURNAMES);
    }

    /** NSS de 11 dígitos con el dígito verificador que exige SocialSecurityNumber::isValid(). */
    private function nss(): string
    {
        $base = '';
        for ($i = 0; $i < 10; $i++) {
            $base .= (string) $this->random->getInt(0, 9);
        }
        for ($digit = 0; $digit <= 9; $digit++) {
            if (SocialSecurityNumber::isValid($base.$digit)) {
                return $base.$digit;
            }
        }

        throw new \LogicException('No existe dígito verificador.');
    }

    private function chance(float $probability): bool
    {
        return $this->random->getFloat(0, 1) < $probability;
    }

    /** @template T @param list<T> $items @return T */
    private function pick(array $items): mixed
    {
        return $items[$this->random->getInt(0, count($items) - 1)];
    }

    /** Hasta $count elementos distintos de $items, en orden aleatorio. */
    private function sample(array $items, int $count): array
    {
        $count = min($count, count($items));
        if ($count <= 0) {
            return [];
        }

        return array_slice($this->random->shuffleArray(array_values($items)), 0, $count);
    }

    /** Clave elegida con probabilidad proporcional a su peso. */
    private function weighted(array $weights): string|int
    {
        $roll = $this->random->getInt(1, array_sum($weights));
        foreach ($weights as $key => $weight) {
            $roll -= $weight;
            if ($roll <= 0) {
                return $key;
            }
        }

        return array_key_last($weights);
    }

    private function between(CarbonImmutable $from, CarbonImmutable $to): CarbonImmutable
    {
        if ($to <= $from) {
            return $from;
        }

        return CarbonImmutable::createFromTimestamp($this->random->getInt($from->getTimestamp(), $to->getTimestamp()), 'UTC');
    }

    /** Inserción por lotes sin límite de parámetros de PostgreSQL. */
    private function insertMany(string $table, array $rows): void
    {
        if ($rows === []) {
            return;
        }
        foreach (array_chunk($rows, max(1, intdiv(self::MAX_PARAMETERS, count($rows[0])))) as $chunk) {
            DB::table($table)->insert($chunk);
        }
    }

    /** @return list<int> identificadores en el mismo orden que $rows */
    private function insertReturning(string $table, array $rows): array
    {
        $ids = [];
        if ($rows === []) {
            return $ids;
        }
        $columns = array_keys($rows[0]);
        foreach (array_chunk($rows, max(1, intdiv(self::MAX_PARAMETERS, count($columns)))) as $chunk) {
            $bindings = [];
            $values = [];
            foreach ($chunk as $row) {
                $placeholders = [];
                foreach ($columns as $column) {
                    $value = $row[$column];
                    if ($value instanceof Expression) {
                        $placeholders[] = $value->getValue(DB::connection()->getQueryGrammar());
                    } else {
                        $placeholders[] = '?';
                        $bindings[] = is_bool($value) ? ($value ? 'true' : 'false') : $value;
                    }
                }
                $values[] = '('.implode(', ', $placeholders).')';
            }
            $sql = sprintf('INSERT INTO %s (%s) VALUES %s RETURNING id', $table, implode(', ', array_map(fn ($c) => '"'.$c.'"', $columns)), implode(', ', $values));
            foreach (DB::select($sql, $bindings) as $row) {
                $ids[] = (int) $row->id;
            }
        }

        return $ids;
    }

    private function report(string $label, int $count): void
    {
        if ($this->progress !== null) {
            ($this->progress)($label, $count);
        }
    }
}
