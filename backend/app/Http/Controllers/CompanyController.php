<?php

namespace App\Http\Controllers;

use App\Enums\SetupDeliveryMethod;
use App\Http\Requests\CompanyRequest;
use App\Http\Requests\InviteCompanyRequest;
use App\Http\Requests\UpdateCompanyStatusRequest;
use App\Models\AccountAuditEvent;
use App\Models\Company;
use App\Models\Municipality;
use App\Models\User;
use App\Services\CompanyAccounts;
use App\Services\InitialPasswordLink;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Empresas validadas por la Secretaría de Economía (HU-S4-02): solo SECRETARY las lista, invita, consulta, edita
 * y activa o inactiva. No existe DELETE (CA-07). Desde HU-S14-02 el alta es una invitación y el perfil es opcional.
 */
class CompanyController extends Controller
{
    private const PER_PAGE = 50;

    public function index(Request $request): JsonResponse
    {
        $validated = $request->validate(
            ['q' => ['nullable', 'string', 'max:200']],
            ['q.string' => 'La búsqueda no es válida.', 'q.max' => 'La búsqueda no debe superar 200 caracteres.'],
        );
        // Búsqueda literal por razón social, nombre comercial, RFC o correo de sus cuentas (CA-08, HU-S14-02):
        // % y _ no son comodines. Un campo en null no coincide.
        $term = trim((string) ($validated['q'] ?? ''));
        $pattern = '%'.addcslashes(mb_strtolower($term), '\\%_').'%';

        $page = $this->withAccountSummary(Company::query())
            ->with('municipality')
            ->when($term !== '', fn ($query) => $query->where(fn ($match) => $match
                ->whereRaw('lower(legal_name) LIKE ?', [$pattern])
                ->orWhereRaw('lower(trade_name) LIKE ?', [$pattern])
                ->orWhereRaw('lower(rfc) LIKE ?', [$pattern])
                ->orWhereExists(fn ($account) => $account->selectRaw('1')->from('users')
                    ->whereColumn('users.company_id', 'companies.id')->whereRaw('lower(users.email) LIKE ?', [$pattern]))))
            // Las invitadas sin nombre van al final; entre ellas, la más antigua primero.
            ->orderByRaw('lower(COALESCE(trade_name, legal_name)) ASC NULLS LAST')
            ->orderBy('id')
            ->paginate(self::PER_PAGE);

        return response()->json([
            'data' => $page->getCollection()->map(fn (Company $company): array => $this->summary($company))->values(),
            'meta' => [
                'current_page' => $page->currentPage(),
                'last_page' => $page->lastPage(),
                'total' => $page->total(),
            ],
        ])->header('Cache-Control', 'no-store, private');
    }

    /**
     * HU-S14-02 CA-01: la invitación crea la empresa sin perfil (con el nombre de referencia, si llega, como nombre
     * comercial) y la cuenta de su operador en una transacción. Sin nombre de la persona, la cuenta guarda el correo
     * como nombre provisional (M3). Después del commit envía el enlace por correo o, con la entrega manual (HU-S2-01),
     * lo devuelve; con correo, el enlace nunca vuelve en la respuesta.
     */
    public function store(InviteCompanyRequest $request, CompanyAccounts $accounts, InitialPasswordLink $links): JsonResponse
    {
        $data = $request->validated();
        $method = SetupDeliveryMethod::from($data['delivery_method'] ?? SetupDeliveryMethod::EMAIL->value);
        $secretary = $request->user();
        $company = new Company(['trade_name' => $data['trade_name'] ?? null]);
        $company->registered_by = $secretary->id;

        try {
            [$user, $setupUrl] = DB::transaction(function () use ($company, $accounts, $data, $secretary): array {
                $company->save();
                AccountAuditEvent::record($secretary, AccountAuditEvent::COMPANY_INVITED, $company);

                return $accounts->create($company, $data['person_name'] ?? $data['email'], $data['email'], $secretary);
            });
        } catch (UniqueConstraintViolationException $exception) {
            // Dos invitaciones simultáneas con el mismo correo: la restricción es la última garantía.
            if ($exception->index !== 'users_email_unique') {
                throw $exception;
            }
            throw ValidationException::withMessages(['email' => ['El correo ya está registrado en otra cuenta.']]);
        }

        $response = $this->detail($company->refresh(), 201);

        return $response->setData([...$links->deliver($user, $setupUrl, $method, $secretary->id), ...(array) $response->getData(true)]);
    }

    public function show(string $company): JsonResponse
    {
        return $this->detail($this->find($company));
    }

    public function update(CompanyRequest $request, string $company): JsonResponse
    {
        $record = $this->find($company);
        $record->fill($request->validated());
        $this->save($record);

        return $this->detail($record->refresh());
    }

    /** Baja lógica (CA-07): inactivar no borra nada; las cuentas de la empresa pierden el acceso (HU-S4-03). */
    public function updateStatus(UpdateCompanyStatusRequest $request, string $company): JsonResponse
    {
        $record = $this->find($company);
        $record->is_active = $request->validated('is_active');
        $record->save();

        return $this->detail($record);
    }

    private function find(string $id): Company
    {
        $company = $this->withAccountSummary(Company::query())->find((int) $id);
        abort_if($company === null, 404, 'La empresa no existe.');

        return $company;
    }

    private function save(Company $company): void
    {
        // El punto de la cabecera se guarda en la misma sentencia que el municipio (CA-05); sin municipio, sin punto.
        if ($company->isDirty('municipality_code')) {
            $company->location = $company->municipality_code === null ? null : Municipality::locationOf($company->municipality_code);
        }

        try {
            DB::transaction(fn () => $company->save());
        } catch (UniqueConstraintViolationException $exception) {
            // Dos altas simultáneas con el mismo RFC: la restricción es la última garantía (CA-03).
            if ($exception->index !== 'companies_rfc_unique') {
                throw $exception;
            }
            throw ValidationException::withMessages(['rfc' => ['Ya existe una empresa registrada con ese RFC.']]);
        }
    }

    /**
     * HU-S14-02 CA-03: el correo de la primera cuenta identifica a la invitada sin nombre, y si alguna cuenta ya
     * creó su contraseña distingue «Acceso pendiente» de un perfil incompleto. Dos subconsultas por fila de la página.
     */
    private function withAccountSummary($query)
    {
        return $query->select('companies.*')
            ->addSelect(['account_email' => User::query()->select('email')->whereColumn('company_id', 'companies.id')->orderBy('id')->limit(1)])
            ->withExists(['accounts as accessed' => fn ($accounts) => $accounts->where('password_setup_required', false)]);
    }

    private function summary(Company $company): array
    {
        return [
            'id' => $company->id,
            'name' => $company->displayName(),
            'legal_name' => $company->legal_name,
            'trade_name' => $company->trade_name,
            'rfc' => $company->rfc,
            'sector_code' => $company->sector_code?->value,
            'state_code' => $company->state_code?->value,
            'municipality_code' => $company->municipality_code,
            'municipality' => $company->municipality?->name,
            'is_active' => $company->is_active,
            'account_email' => $company->getAttribute('account_email'),
            'profile_status' => $company->profileStatus((bool) $company->getAttribute('accessed')),
        ];
    }

    private function detail(Company $company, int $status = 200): JsonResponse
    {
        // Se relee con el resumen de cuentas: el correo y el estado de acceso no son columnas de companies.
        $company = $this->find((string) $company->id)->load(['municipality', 'registrar']);

        return response()->json(['data' => [
            ...$this->summary($company),
            'contact_name' => $company->contact_name,
            'contact_position' => $company->contact_position,
            'contact_email' => $company->contact_email,
            'contact_phone' => $company->contact_phone,
            'validation_reference' => $company->validation_reference,
            // HU-S14-02: lo que falta del perfil, en claves estables (name, contact_*, legal_name, rfc, sector_code, location).
            'missing' => $company->missing(),
            // CA-06: cuenta SECRETARY que la dio de alta.
            'registered_by' => ['id' => $company->registrar->id, 'name' => $company->registrar->name],
            'created_at' => $company->created_at?->toISOString(),
            'updated_at' => $company->updated_at?->toISOString(),
        ]], $status)->header('Cache-Control', 'no-store, private');
    }
}
