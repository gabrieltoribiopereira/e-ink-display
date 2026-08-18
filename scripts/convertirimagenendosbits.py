#!/usr/bin/env python3

import argparse
import os
import re
from PIL import Image

# Dirección de la carpeta a procesar
FOLDER = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "output")

# valores de la escalación y la rotación
TARGET_WIDTH = None      # ej. 800
TARGET_HEIGHT = None     # ej. 480
ROTATE = 90
INVERT = False           # True si negro/blanco salen al reves en el display
LSB_FIRST = False        # True si la imagen sale espejada/desordenada

EXTS = {".png"}


def quantize_4(value: int) -> int: #reducir pixeles a 4bits
    return value * 4 // 256


def sanitize(filename: str) -> str:
    stem = os.path.splitext(os.path.basename(filename))[0]
    ident = re.sub(r"[^0-9a-zA-Z_]", "_", stem)
    if ident and ident[0].isdigit():
        ident = "_" + ident
    return ident or "img"


def convert(path, rotate=None):
    img = Image.open(path).convert("L")  #cargar imagen
    r = ROTATE if rotate is None else rotate #rotar
    if r:
        img = img.rotate(r, expand=True)     # 480x800 -> 800x480
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


def convertir_una(ruta, width=None, height=None, name=None, out=None, bin_out=None):
    global TARGET_WIDTH, TARGET_HEIGHT
    TARGET_WIDTH, TARGET_HEIGHT = width, height
    ident = name or sanitize(ruta)
    W, H, data = convert(ruta)

    # El .bin es lo que descarga el ESP32: los mismos bytes que van dentro del
    # array de C, pero sin el envoltorio de texto. El .h solo sirve para
    # compilar imagenes fijas dentro del firmware.
    if bin_out:
        with open(bin_out, "wb") as f:
            f.write(data)
        print(f"  {os.path.basename(ruta)}  ->  {os.path.basename(bin_out)}   "
              f"({W}x{H}, {len(data)} bytes)")

    if out or not bin_out:
        out_path = out or os.path.splitext(ruta)[0] + ".h"
        write_header(ident, W, H, data, out_path)
        print(f"  {os.path.basename(ruta)}  ->  {ident}.h   ({W}x{H}, {len(data)} bytes)")


if __name__ == "__main__":
    p = argparse.ArgumentParser(description="PNG -> .h en 4 grises (2 bpp)")
    p.add_argument("imagen", nargs="?", help="imagen suelta; sin esto convierte toda la carpeta")
    p.add_argument("--width", type=int)
    p.add_argument("--height", type=int)
    p.add_argument("--name", help="identificador C del array")
    p.add_argument("--out", help="ruta del .h de salida")
    p.add_argument("--bin", dest="bin_out",
                   help="ruta del .bin crudo (lo que descarga el ESP32)")
    a = p.parse_args()

    if a.imagen:
        convertir_una(a.imagen, a.width, a.height, a.name, a.out, a.bin_out)
    else:
        main()
