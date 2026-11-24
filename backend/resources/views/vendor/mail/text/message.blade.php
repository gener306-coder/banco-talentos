{{-- T-S18-05: versión de texto plano con el mismo pie en español que la HTML. --}}
<x-mail::layout>
    {{-- Header --}}
    <x-slot:header>
        <x-mail::header :url="config('app.frontend_url')">
            {{ config('app.name') }}
        </x-mail::header>
    </x-slot:header>

    {{-- Body --}}
    {{ $slot }}

    {{-- Subcopy --}}
    @isset($subcopy)
        <x-slot:subcopy>
            <x-mail::subcopy>
                {{ $subcopy }}
            </x-mail::subcopy>
        </x-slot:subcopy>
    @endisset

    {{-- Footer --}}
    <x-slot:footer>
        <x-mail::footer>
            {{ config('app.name') }} – Educación Dual · {{ config('app.frontend_url') }}

            Este correo se envió automáticamente desde la plataforma; no lo respondas.
        </x-mail::footer>
    </x-slot:footer>
</x-mail::layout>
