#!/usr/bin/env python3
"""T-S18-03: genera los favicons a partir del isotipo de Nodologístico (sin la palabra «nodologístico").

Recorta frontend/public/brand/logo.png (versión a color) por encima de la franja vacía que separa el dibujo del texto,
lo centra en un lienzo cuadrado y escribe en frontend/public:
  - favicon.ico           16, 32 y 48 px (transparente)
  - favicon.png           192 px (transparente)
  - apple-touch-icon.png  180 px sobre fondo blanco (iOS rellena la transparencia de negro)

Uso: python3 scripts/brand/build-favicons.py   (requiere Pillow)
"""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'frontend/public/brand/logo.png'
PUBLIC = ROOT / 'frontend/public'
ALPHA = 20  # umbral para considerar visible un píxel


def isotype(logo: Image.Image) -> Image.Image:
    """Recorta el dibujo: de la primera fila visible hasta la última antes del primer hueco que lo separa del texto."""
    alpha = logo.getchannel('A')
    width, height = logo.size
    visible = [alpha.crop((0, y, width, y + 1)).getextrema()[1] > ALPHA for y in range(height)]
    top = visible.index(True)
    bottom = top
    while bottom + 1 < height and visible[bottom + 1]:
        bottom += 1
    drawing = logo.crop((0, top, width, bottom + 1))
    return drawing.crop(drawing.getchannel('A').point(lambda value: 255 if value > ALPHA else 0).getbbox())


def square(image: Image.Image, padding: float, background=(0, 0, 0, 0)) -> Image.Image:
    side = round(max(image.size) * (1 + 2 * padding))
    canvas = Image.new('RGBA', (side, side), background)
    canvas.alpha_composite(image, ((side - image.width) // 2, (side - image.height) // 2))
    return canvas


def main() -> None:
    mark = isotype(Image.open(SOURCE).convert('RGBA'))
    tab = square(mark, padding=0.02)
    tab.resize((192, 192), Image.Resampling.LANCZOS).save(PUBLIC / 'favicon.png', optimize=True)
    tab.save(PUBLIC / 'favicon.ico', sizes=[(16, 16), (32, 32), (48, 48)])
    touch = square(mark, padding=0.12, background=(255, 255, 255, 255))
    touch.resize((180, 180), Image.Resampling.LANCZOS).convert('RGB').save(PUBLIC / 'apple-touch-icon.png', optimize=True)
    print(f'isotipo {mark.size[0]}x{mark.size[1]} → favicon.ico, favicon.png y apple-touch-icon.png en {PUBLIC}')


if __name__ == '__main__':
    main()
