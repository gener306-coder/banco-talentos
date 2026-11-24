#!/usr/bin/env python3
"""T-S18-05: genera el logo de los correos (frontend/public/brand/logo-correo.png).

Logotipo completo a color (brand/logo.png) con fondo transparente, para que no forme un recuadro sobre el fondo del
correo; en los clientes con modo oscuro, el vino y el dorado siguen legibles. A 2× del tamaño con el que se muestra
(64 px de alto en el encabezado del correo).
Caddy lo sirve en <APP_URL>/brand/logo-correo.png, la URL que usa la plantilla (config('mail.logo_url')).

Uso: python3 scripts/brand/build-mail-logo.py   (requiere Pillow)
"""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'frontend/public/brand/logo.png'
TARGET = ROOT / 'frontend/public/brand/logo-correo.png'
HEIGHT = 128  # 2 × 64 px


def main() -> None:
    logo = Image.open(SOURCE).convert('RGBA')
    logo = logo.crop(logo.getchannel('A').point(lambda value: 255 if value > 20 else 0).getbbox())
    width = round(logo.width * HEIGHT / logo.height)
    logo = logo.resize((width, HEIGHT), Image.Resampling.LANCZOS)
    logo.save(TARGET, optimize=True)
    print(f'{TARGET.relative_to(ROOT)}: {width}x{HEIGHT}, {TARGET.stat().st_size} bytes')


if __name__ == '__main__':
    main()
