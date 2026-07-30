#!/usr/bin/env python3
"""
convertirimagenendosbits.py

Al ejecutarse recorre TODAS las imagenes de esta carpeta y genera un archivo
.h separado por cada una, en escala de 4 grises (2 bits por pixel, 4 px/byte,
MSB-first). Formato compatible con Waveshare 7.5" e-Paper (EPD_7IN5_V2_4Gray).

Uso:
    python3 convertirimagenendosbits.py
"""
import os
import re
from PIL import Image

# ------------------------- CONFIGURACION -------------------------
# Carpeta a procesar: por defecto la carpeta donde esta este script.
FOLDER = os.path.dirname(os.path.abspath(__file__))

# Reescalar todas las imagenes a este tamano. Pon None, None para conservar
# el tamano original de cada imagen.
TARGET_WIDTH = None      # ej. 800
TARGET_HEIGHT = None     # ej. 480

INVERT = False           # True si negro/blanco salen al reves en el display
LSB_FIRST = False        # True si la imagen sale espejada/desordenada
# -----------------------------------------------------------------

EXTS = {".png", ".jpg", ".jpeg", ".bmp", ".gif", ".webp"}


def quantize_4(value: int) -> int:
    return value * 4 // 256  # 0..255 -> 0..3


def sanitize(filename: str) -> str:
    stem = os.path.splitext(os.path.basename(filename))[0]
    ident = re.sub(r"[^0-9a-zA-Z_]", "_", stem)
    if ident and ident[0].isdigit():
        ident = "_" + ident
    return ident or "img"


def convert(path):
    img = Image.open(path).convert("L")
    if TARGET_WIDTH or TARGET_HEIGHT:
        w = TARGET_WIDTH or img.width
        h = TARGET_HEIGHT or img.height
        img = img.resize((w, h), Image.LANCZOS)
    W, H = img.width, img.height
    px = img.load()

    data = bytearray()
    for y in range(H):
        acc = count = 0
        for x in range(W):
            level = quantize_4(px[x, y])
            if INVERT:
                level = 3 - level
            if LSB_FIRST:
                acc |= level << (count * 2)
            else:
                acc |= level << ((3 - count) * 2)
            count += 1
            if count == 4:
                data.append(acc)
                acc = count = 0
        if count:
            data.append(acc)
    return W, H, data


def write_header(ident, W, H, data, out_path):
    lines = []
    lines.append(f"// {ident}  ->  {W}x{H}, 2 bpp (4 grises), "
                 f"{'LSB' if LSB_FIRST else 'MSB'}-first"
                 f"{', invertido' if INVERT else ''}")
    guard = ident.upper() + "_H"
    lines.append(f"#ifndef {guard}")
    lines.append(f"#define {guard}")
    lines.append(f"#define {ident.upper()}_WIDTH  {W}")
    lines.append(f"#define {ident.upper()}_HEIGHT {H}")
    lines.append(f"static const unsigned char {ident}[{len(data)}] = {{")
    for i in range(0, len(data), 16):
        chunk = data[i:i + 16]
        lines.append("    " + ", ".join(f"0x{b:02X}" for b in chunk) + ",")
    lines.append("};")
    lines.append(f"#endif // {guard}")
    with open(out_path, "w") as f:
        f.write("\n".join(lines) + "\n")


def main():
    files = sorted(
        f for f in os.listdir(FOLDER)
        if os.path.splitext(f)[1].lower() in EXTS
    )
    if not files:
        print(f"No se encontraron imagenes en {FOLDER}")
        return

    print(f"Procesando {len(files)} imagen(es) en {FOLDER}\n")
    for f in files:
        ident = sanitize(f)
        try:
            W, H, data = convert(os.path.join(FOLDER, f))
        except Exception as e:
            print(f"  ! {f}: error -> {e}")
            continue
        out_path = os.path.join(FOLDER, ident + ".h")
        write_header(ident, W, H, data, out_path)
        print(f"  {f}  ->  {ident}.h   ({W}x{H}, {len(data)} bytes)")

    print("\nListo.")


if __name__ == "__main__":
    main()
