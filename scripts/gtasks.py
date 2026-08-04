import argparse
import os.path
import json
from datetime import date

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build

SCOPES = ["https://www.googleapis.com/auth/tasks.readonly"]

RAIZ   = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TOKEN  = os.path.join(RAIZ, "secrets", "token.json")
CREDS  = os.path.join(RAIZ, "secrets", "credentials.json")
SALIDA = os.path.join(RAIZ, "data", "tareas.json")

def get_service(interactivo=True):
    creds = None
    if os.path.exists(TOKEN):
        creds = Credentials.from_authorized_user_file(TOKEN, SCOPES)
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        elif interactivo:
            flow = InstalledAppFlow.from_client_secrets_file(CREDS, SCOPES)
            creds = flow.run_local_server(port=0)
        else:
            # Sin esto el server se quedaria colgado para siempre esperando a
            # que alguien autorice en un navegador que nadie esta mirando.
            raise SystemExit(
                "sin token valido y --auto no puede abrir el navegador; "
                "ejecuta una vez a mano: .venv/bin/python scripts/gtasks.py"
            )
        with open(TOKEN, "w") as f:
            f.write(creds.to_json())
    return build("tasks", "v1", credentials=creds)


def obtener_tareas(service, debug=False):
    hoy = date.today().isoformat()
    salida = []
    listas = service.tasklists().list(maxResults=10).execute().get("items", [])
    for lista in listas:
        tareas = service.tasks().list(
            tasklist=lista["id"],
            showCompleted=True,
            showHidden=True,
            maxResults=100,
        ).execute().get("items", [])

        if debug:
            print(json.dumps(tareas, indent=2, ensure_ascii=False))

        filtradas = [
                    t for t in tareas
                    if (t.get("due", "9999")[:10] >= hoy)
                    or (t.get("completed", "")[:10] == hoy)
                ]
        filtradas.sort(key=lambda t: t.get("due", "9999"))

        salida.append({
            "lista": lista["title"],
            "tareas": [
                {
                    "id": t["id"],
                    "titulo": t["title"],
                    "notas": t.get("notes", ""),
                    "vence": t.get("due"),
                    "estado": t["status"],
                    "completada": t.get("completed"),
                    "padre": t.get("parent"),
                    "posicion": t.get("position"),
                }
                for t in filtradas
            ],
        })
    return salida


def subir_a_supabase(datos):
    """
    Escribe las tareas en la tabla `tareas` para que la web las lea desde
    cualquier dispositivo, tambien desplegada en Netlify donde no hay disco.

    Inicia sesion con la cuenta del display en vez de usar la clave de servicio:
    asi escribe solo su propia fila y RLS sigue vigilando. La clave de servicio
    se salta RLS y no hace falta aqui.
    """
    url = os.environ.get("SUPABASE_URL")
    anon = os.environ.get("SUPABASE_ANON_KEY")
    email = os.environ.get("DISPLAY_EMAIL")
    password = os.environ.get("DISPLAY_PASSWORD")
    if not all([url, anon, email, password]):
        print("  (sin credenciales de Supabase: solo se guardo el archivo local)")
        return

    import requests
    url = url.rstrip("/")
    cab = {"apikey": anon, "Content-Type": "application/json"}

    r = requests.post(f"{url}/auth/v1/token?grant_type=password",
                      headers=cab, json={"email": email, "password": password}, timeout=30)
    if not r.ok:
        print(f"  AVISO: no se pudo iniciar sesion en Supabase ({r.status_code})")
        return
    sesion = r.json()
    jwt, uid = sesion["access_token"], sesion["user"]["id"]

    r = requests.post(
        f"{url}/rest/v1/tareas",
        headers={**cab, "Authorization": f"Bearer {jwt}",
                 "Prefer": "resolution=merge-duplicates"},
        json={"usuario": uid, "datos": datos},
        timeout=30,
    )
    if r.ok:
        print("  tareas subidas a Supabase")
    else:
        print(f"  AVISO: no se pudieron subir ({r.status_code}): {r.text[:120]}")


if __name__ == "__main__":
    p = argparse.ArgumentParser(description="Vuelca las tareas de Google Tasks a Supabase")
    p.add_argument("--auto", action="store_true",
                   help="modo desatendido (lo usa el server): no abre el navegador "
                        "para autorizar ni vuelca el JSON crudo por pantalla")
    args = p.parse_args()

    service = get_service(interactivo=not args.auto)
    datos = obtener_tareas(service, debug=not args.auto)

    if not args.auto:
        for lista in datos:
            print(f"\n== {lista['lista']} ==")
            for t in lista["tareas"]:
                check = "[x]" if t["estado"] == "completed" else "[ ]"
                sangria = "   " if t["padre"] else ""
                print(f"{sangria} {check} {t['titulo']}")
                if t["notas"]:
                    print(f"{sangria}       {t['notas']}")

    # Copia local: la sigue usando el server para depurar y no cuesta nada.
    os.makedirs(os.path.dirname(SALIDA), exist_ok=True)
    with open(SALIDA, "w", encoding="utf-8") as f:
        json.dump(datos, f, ensure_ascii=False, indent=2)

    subir_a_supabase(datos)

    total = sum(len(x["tareas"]) for x in datos)
    print(f"{total} tareas guardadas en {SALIDA}")
