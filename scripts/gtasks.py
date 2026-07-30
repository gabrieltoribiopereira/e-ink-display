import os.path
import json
from datetime import date

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build

SCOPES = ["https://www.googleapis.com/auth/tasks.readonly"]


def get_service():
    creds = None
    if os.path.exists("token.json"):
        creds = Credentials.from_authorized_user_file("token.json", SCOPES)
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            flow = InstalledAppFlow.from_client_secrets_file("credentials.json", SCOPES)
            creds = flow.run_local_server(port=0)
        with open("token.json", "w") as f:
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


if __name__ == "__main__":
    service = get_service()
    datos = obtener_tareas(service, debug=True)

    for lista in datos:
        print(f"\n== {lista['lista']} ==")
        for t in lista["tareas"]:
            check = "[x]" if t["estado"] == "completed" else "[ ]"
            sangria = "   " if t["padre"] else ""
            print(f"{sangria} {check} {t['titulo']}")
            if t["notas"]:
                print(f"{sangria}       {t['notas']}")

    with open("tareas.json", "w", encoding="utf-8") as f:
        json.dump(datos, f, ensure_ascii=False, indent=2)

    total = sum(len(x["tareas"]) for x in datos)
    print(f"\n{total} tareas de hoy guardadas en tareas.json")
