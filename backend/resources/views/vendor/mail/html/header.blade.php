{{-- T-S18-05: encabezado de los correos con el logotipo (URL pública, config('mail.logo_url')) y el nombre de la plataforma. --}}
@props(['url'])
<tr>
<td class="header">
<a href="{{ $url }}" style="display: inline-block; text-decoration: none;">
<img src="{{ config('mail.logo_url') }}" class="brand-logo" width="54" height="64" alt="Nodologístico">
<span class="brand-eyebrow">Educación Dual</span>
<span class="brand-name">{{ config('app.name') }}</span>
</a>
</td>
</tr>
