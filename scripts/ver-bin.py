#!/usr/bin/env python3
"""
ver-bin.py

Reconstruye un .bin de 2 bits por pixel como PNG, para poder mirar con los ojos
lo que va a pintar el ESP32. Es la comprobacion que evita descubrir un frame
corrupto ya con el panel delante.

Uso:
    python3 scripts/ver-bin.py esp32-sim/todo.bin
    python3 scripts/ver-bin.py esp32-sim/todo.bin --abrir

Ojo con el interprete: necesita Pillow, que esta en el python del SISTEMA y no
en el venv (al reves que las librerias de Google).
"""
import argparse
import os
import subprocess
import sys

from PIL import Image

ANCHO, ALTO = 800, 480
NIVELES = [0, 85, 170, 255]      # los 4 grises del panel, de negro a blanco


def reconstruir(ruta_bin, ruta_png):
    datos = open(ruta_bin, "rb").read()
    esperados = ANCHO * ALTO * 2 // 8
    if len(datos) != esperados:
        print(f"AVISO: {len(datos)} bytes, se esperaban {esperados}. "
              "El frame esta incompleto o corrupto.")

    img = Image.new("L", (ANCHO, ALTO), 255)
    px = img.load()
    i = 0
    for y in range(ALTO):
        for x in range(0, ANCHO, 4):
            if i >= len(datos):
                break
            b = datos[i]
            i += 1
            for k in range(4):          # 4 pixeles por byte, MSB primero
                if x + k < ANCHO:
                    px[x + k, y] = NIVELES[(b >> ((3 - k) * 2)) & 3]
    img.save(ruta_png)
    return img


def main():
    p = argparse.ArgumentParser(description="Ver un .bin de 2bpp como imagen")
    p.add_argument("bin", help="ruta del .bin")
    p.add_argument("--abrir", action="store_true", help="abrirlo tras generarlo")
    a = p.parse_args()

    if not os.path.exists(a.bin):
        sys.exit(f"no existe {a.bin}")

    png = os.path.splitext(a.bin)[0] + "-vista.png"
    img = reconstruir(a.bin, png)

    # Cuantos pixeles hay de cada gris: si sale 100% de un solo nivel, el frame
    # esta en blanco y algo fallo al renderizar.
    total = ANCHO * ALTO
    cuenta = img.histogram()
    print(f"{png}  ({ANCHO}x{ALTO})")
    for nivel, nombre in zip(NIVELES, ["negro", "gris oscuro", "gris claro", "blanco"]):
        pct = cuenta[nivel] * 100 / total
        if pct > 0.01:
            print(f"  {nombre:12s} {pct:5.1f}%")

    if a.abrir:
        # env -u LD_LIBRARY_PATH: el terminal de Zed (Flatpak) inyecta una glib
        # vieja que rompe los visores del sistema.
        entorno = {k: v for k, v in os.environ.items() if k != "LD_LIBRARY_PATH"}
        for visor in ("loupe", "ristretto", "display", "xdg-open"):
            try:
                subprocess.Popen([visor, png], env=entorno,
                                 stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                print(f"  abierto con {visor}")
                break
            except FileNotFoundError:
                continue


if __name__ == "__main__":
    main()
