<?php

namespace App\Http\Controllers;

use App\Http\Requests\CompanyRequest;
use App\Http\Requests\UpdateCompanyStatusRequest;
use App\Models\Company;
use App\Models\Municipality;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Empresas validadas por la Secretaría de Economía (HU-S4-02): solo SECRETARY las lista, registra, consulta, edita
 * y activa o inactiva. No existe DELETE (CA-07).
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
        // Búsqueda literal por razón social, nombre comercial o RFC (CA-08): % y _ no son comodines.
        $term = trim((string) ($validated['q'] ?? ''));
        $pattern = '%'.addcslashes(mb_strtolower($term), '\\%_').'%';

        $page = Company::query()
            ->with('municipality')
            ->when($term !== '', fn ($query) => $query->where(fn ($match) => $match
                ->whereRaw('lower(legal_name) LIKE ?', [$pattern])
                ->orWhereRaw('lower(trade_name) LIKE ?', [$pattern])
                ->orWhereRaw('lower(rfc) LIKE ?', [$pattern])))
            ->orderByRaw('lower(legal_name)')
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

    public function store(CompanyRequest $request): JsonResponse
    {
        $company = new Company($request->validated());
        $company->registered_by = $request->user()->id;
        $this->save($company);

        return $this->detail($company->refresh(), 201);
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
        $company = Company::query()->find((int) $id);
        abort_if($company === null, 404, 'La empresa no existe.');

        return $company;
    }

    private function save(Company $company): void
    {
        // El punto de la cabecera se guarda en la misma sentencia que el municipio (CA-05).
        if ($company->isDirty('municipality_code') || ! $company->exists) {
            $company->location = Municipality::locationOf($company->municipality_code);
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

    private function summary(Company $company): array
    {
        return [
            'id' => $company->id,
            'legal_name' => $company->legal_name,
            'trade_name' => $company->trade_name,
            'rfc' => $company->rfc,
            'sector_code' => $company->sector_code->value,
            'state_code' => $company->state_code->value,
            'municipality_code' => $company->municipality_code,
            'municipality' => $company->municipality?->name,
            'is_active' => $company->is_active,
        ];
    }

    private function detail(Company $company, int $status = 200): JsonResponse
    {
        $company->loadMissing(['municipality', 'registrar']);

        return response()->json(['data' => [
            ...$this->summary($company),
            'contact_name' => $company->contact_name,
            'contact_email' => $company->contact_email,
            'contact_phone' => $company->contact_phone,
            'validation_reference' => $company->validation_reference,
            // CA-06: cuenta SECRETARY que la dio de alta.
            'registered_by' => ['id' => $company->registrar->id, 'name' => $company->registrar->name],
            'created_at' => $company->created_at?->toISOString(),
            'updated_at' => $company->updated_at?->toISOString(),
        ]], $status)->header('Cache-Control', 'no-store, private');
    }
}
