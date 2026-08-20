#!/usr/bin/env python3
"""
simular-esp32.py

Simula el cliente que ira dentro del ESP32. Habla con la API del server igual
que lo hara el firmware, para poder probar toda la cadena sin hardware.

Uso:
    .venv/bin/python scripts/simular-esp32.py 3           # pulsa el boton 3
    .venv/bin/python scripts/simular-esp32.py 3 --ver     # y abre la imagen
    .venv/bin/python scripts/simular-esp32.py             # solo mira si hay cambios
    .venv/bin/python scripts/simular-esp32.py --nube --ver

Todo se guarda en esp32-sim/, que hace de memoria del dispositivo.

Se escribe a proposito con las limitaciones del ESP32 aunque en Python no
hagan falta, para que la traduccion a MicroPython o C++ sea directa:
  - la descarga va por trozos, nunca los 96000 bytes de golpe
  - el hash se guarda en disco, simulando la RTC memory que sobrevive al
    deep sleep (una variable no simularia nada)
"""
import hashlib
import json
import subprocess
import sys
import time
from pathlib import Path

import requests

BASE = "http://localhost:8002"
RAIZ = Path(__file__).resolve().parent.parent
PANTALLAS = ["inicio", "calendario", "calendario-semana", "todo", "habitos"]
DESTINO = RAIZ / "esp32-sim"          # la "memoria" del ESP32
ESTADO = DESTINO / "estado.json"
BYTES_ESPERADOS = 800 * 480 * 2 // 8  # 96000: 2 bits por pixel

TROZO = 2048    # lo que leeria de golpe el ESP32; en C++ seria el buffer


def token():
    f = RAIZ / "secrets" / "device-token.txt"
    if not f.exists():
        salir(f"falta {f}\n  creala con el mismo valor que el secret DEVICE_TOKEN")
    return f.read_text().strip()


def salir(msg):
    print(f"ERROR: {msg}")
    sys.exit(1)


def pedir(metodo, ruta, **kw):
    """Llamada a la API con el token y los errores ya tratados."""
    cabeceras = {"Authorization": f"Bearer {token()}"}
    cabeceras.update(kw.pop("headers", {}))
    try:
        r = requests.request(metodo, BASE + ruta, headers=cabeceras, timeout=60, **kw)
    except requests.exceptions.ConnectionError:
        salir(f"no responde {BASE}\n  arranca el server:  cd server && npm start")
    if r.status_code == 401:
        salir("token rechazado; revisa secrets/device-token.txt")
    if r.status_code >= 400:
        salir(f"{metodo} {ruta} -> HTTP {r.status_code}: {r.text[:200]}")
    return r


def pulsar(n):
    """POST /api/boton: pulsa y espera a que el server regenere el frame."""
    datos = pedir("POST", "/api/boton", json={"boton": n}).json()
    print(f"  boton {n} -> pantalla '{datos['pantalla']}'")
    return datos


def estado_remoto():
    """GET /api/estado: que se ve ahora y con que hash."""
    return pedir("GET", "/api/estado").json()


def hash_guardado(pantalla):
    """El hash de la ultima descarga. En el ESP32 esto vive en RTC memory."""
    if not ESTADO.exists():
        return None
    try:
        return json.loads(ESTADO.read_text()).get(pantalla)
    except json.JSONDecodeError:
        return None   # memoria corrupta: se trata como "no tengo nada"


def guardar_hash(pantalla, h):
    guardados = {}
    if ESTADO.exists():
        try:
            guardados = json.loads(ESTADO.read_text())
        except json.JSONDecodeError:
            pass
    guardados[pantalla] = h
    ESTADO.write_text(json.dumps(guardados, indent=2))


def descargar(pantalla, hash_esperado):
    """
    GET /api/frame/<pantalla>.bin por trozos.

    En el ESP32 cada trozo iria directo al framebuffer del display en vez de a
    un archivo, porque los 96000 bytes enteros no caben comodos en RAM despues
    de levantar el WiFi.
    """
    destino = DESTINO / f"{pantalla}.bin"
    sha = hashlib.sha256()
    total = trozos = 0

    r = pedir("GET", f"/api/frame/{pantalla}.bin", stream=True)
    with open(destino, "wb") as f:
        for trozo in r.iter_content(chunk_size=TROZO):
            f.write(trozo)          # <- aqui el ESP32 volcaria al display
            sha.update(trozo)
            total += len(trozo)
            trozos += 1

    # Verificar SIEMPRE: una transferencia a medias pintaria basura en el panel,
    # y ese fallo es carisimo de depurar ya sobre el hardware.
    if total != BYTES_ESPERADOS:
        salir(f"llegaron {total} bytes y se esperaban {BYTES_ESPERADOS}")
    if sha.hexdigest() != hash_esperado:
        salir("el hash de lo descargado no coincide: transferencia corrupta")

    print(f"  descargados {total} bytes en {trozos} trozos de {TROZO}")
    print(f"  hash verificado: {sha.hexdigest()[:16]}...")
    return destino


def con_reintentos(hacer, intentos=3, espera=3):
    """
    Reintenta ante fallos temporales.

    Imprescindible en el ESP32: la Edge Function se apaga cuando no se usa y la
    primera peticion tras un rato puede devolver 502 mientras arranca. Como el
    dispositivo despierta cada 20 min, se va a encontrar ese arranque en frio
    casi siempre. Sin esto, se dormiria dejando la pantalla desactualizada.
    """
    for intento in range(1, intentos + 1):
        try:
            r = hacer()
            if r.status_code < 500:
                return r          # 4xx es culpa nuestra: reintentar no arregla nada
            motivo = f"HTTP {r.status_code}"
        except requests.exceptions.RequestException as e:
            motivo = type(e).__name__
        if intento < intentos:
            print(f"  {motivo}, reintento {intento}/{intentos - 1} en {espera}s")
            time.sleep(espera)
    salir(f"{intentos} intentos fallidos ({motivo})")


def url_nube():
    """Endpoint de la Edge Function, sacado de secrets/config.js."""
    f = RAIZ / "secrets" / "config.js"
    if not f.exists():
        salir("falta secrets/config.js para saber la URL de Supabase")
    import re
    m = re.search(r'SUPABASE_URL:\s*["\']([^"\']+)["\']', f.read_text())
    if not m:
        salir("no encuentro SUPABASE_URL en secrets/config.js")
    return m.group(1).rstrip("/") + "/functions/v1/frame"


def modo_nube():
    """
    Lo que hara el ESP32 de verdad: no pulsa botones contra ningun server, se
    baja el manifiesto de Supabase y actualiza solo las pantallas que cambiaron.
    Cambiar de pantalla con un boton es luego instantaneo, sin red.
    """
    base = url_nube()
    cab = {"x-device-token": token()}   # cabecera propia: ver la Edge Function
    print(f"ESP32 despierta (nube: {base})")

    r = con_reintentos(lambda: requests.get(base, headers=cab, timeout=30))
    if r.status_code == 401:
        salir("token rechazado por la Edge Function; revisa el secret DEVICE_TOKEN")
    if r.status_code >= 400:
        salir(f"manifiesto -> HTTP {r.status_code}: {r.text[:200]}")

    manifiesto = r.json()
    print(f"  manifiesto de {manifiesto.get('generado', '?')}")

    nuevas = 0
    for pantalla, info in manifiesto["pantallas"].items():
        if hash_guardado(pantalla) == info["hash"]:
            print(f"  {pantalla:11s} sin cambios")
            continue
        d = con_reintentos(
            lambda: requests.get(base, params={"p": pantalla}, headers=cab, timeout=60)
        ).content
        if len(d) != BYTES_ESPERADOS:
            salir(f"{pantalla}: llegaron {len(d)} bytes de {BYTES_ESPERADOS}")
        if hashlib.sha256(d).hexdigest() != info["hash"]:
            salir(f"{pantalla}: hash distinto, transferencia corrupta")
        (DESTINO / f"{pantalla}.bin").write_bytes(d)
        guardar_hash(pantalla, info["hash"])
        print(f"  {pantalla:11s} descargada ({len(d)} bytes)")
        nuevas += 1

    print(f"ESP32 a dormir ({nuevas} de {len(manifiesto['pantallas'])} actualizadas)")


def abrir_imagen(pantalla):
    """
    Reconstruye el .bin como PNG y lo abre. Es lo mismo que veria el panel:
    girado 90 grados y con solo 4 grises, no la captura original.
    """
    subprocess.run(
        [sys.executable, str(RAIZ / "scripts" / "ver-bin.py"),
         str(DESTINO / f"{pantalla}.bin"), "--abrir"],
        check=False,
    )


def main():
    args = sys.argv[1:]
    # --ver abre la imagen al terminar; se saca de la lista antes de mirar el resto
    ver = "--ver" in args
    if ver:
        args.remove("--ver")

    DESTINO.mkdir(exist_ok=True)

    if args and args[0] == "--nube":
        modo_nube()
        if ver:
            for p in PANTALLAS:
                if (DESTINO / f"{p}.bin").exists():
                    abrir_imagen(p)
        return

    boton = None
    if args:
        if args[0] not in ("1", "2", "3", "4"):
            salir("el boton debe ser 1, 2, 3 o 4  (o --nube), con --ver opcional")
        boton = int(args[0])

    print("ESP32 despierta")

    if boton:
        pulsar(boton)

    remoto = estado_remoto()
    pantalla, hash_nuevo = remoto["pantalla"], remoto["hash"]
    print(f"  pantalla activa: {pantalla}")

    if hash_guardado(pantalla) == hash_nuevo:
        print(f"  hash sin cambios -> NO descargo, NO refresco el e-ink")
        print("ESP32 a dormir (ahorro: ~4 s de refresco)")
        if ver:
            abrir_imagen(pantalla)   # sigue en el panel, asi que se ensena igual
        return

    descargar(pantalla, hash_nuevo)
    guardar_hash(pantalla, hash_nuevo)
    # Aqui el ESP32 haria el refresco real del panel
    print(f"  refrescando e-ink con {pantalla}.bin")
    print("ESP32 a dormir")

    if ver:
        abrir_imagen(pantalla)


if __name__ == "__main__":
    main()
