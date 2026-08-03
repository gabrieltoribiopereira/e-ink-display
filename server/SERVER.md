# Explicación de como usar el server

El server sirve la web de `web/`, la abre en un Chromium propio y captura
`.contenedor` para generar los `.h` que consume el ESP32.

Puerto: **8002**

## 0 requisito: cuenta del display

La web tiene login, y el navegador que abre el server arranca sin sesión.
Hay que darle una cuenta dedicada en `secrets/display.json`:

```json
{ "email": "display@ejemplo.com", "password": "..." }
```

Sin ese archivo el server arranca igual, pero `/boton` y `/captura.png`
devuelven error porque el dashboard está oculto.

## 1 empezar el server:

```
cd server
npm start          # o: node server.js
```

Luego abre <http://localhost:8002>.

### solo ver la web (sin capturas)

```
npm run web        # o: node server.js --solo-web
```

Arranca al instante porque no lanza Chromium. Sirve la web igual, pero
`/boton` y `/captura.png` devuelven 503. Es el modo para maquetar.

> No vale abrir `web/index.html` a pelo con `file://`: `config.js` se sirve
> desde `secrets/` y `tareas.json` desde `data/`, ninguno de los dos esta
> dentro de `web/`. Ademas Supabase Auth necesita un origen `http`.

## 1.5 tareas de Google Tasks

El server sincroniza `data/tareas.json` solo, sin que tengas que ejecutar nada:

- al arrancar
- cada 10 minutos en segundo plano
- justo antes de capturar la pantalla To-Do (y le pide a la página que recargue)

Como mucho llama a Google una vez cada 10 min, aunque captures sin parar.

**Requisito:** `secrets/token.json`. Se crea la primera vez, autorizando a mano:

```
.venv/bin/python scripts/gtasks.py
```

Ojo con el intérprete: `gtasks.py` necesita el del **venv** (tiene las librerías de
Google), y `convertirimagenendosbits.py` el del **sistema** (tiene Pillow).
Ninguno de los dos sirve para ambos.

Sin `token.json` el server arranca igual y avisa por consola; el resto sigue
funcionando, solo que el To-Do se queda con los últimos datos guardados.

## 2 ejecutar botón:
se tiene que hacer en otra terminal:

```
curl -X POST http://localhost:8002/boton -d "2" -o boton2.png
```

Las capturas y los `.h` se guardan solos en `output/`.

## 3 ver la pantalla actual sin pulsar nada:

```
curl -s http://localhost:8002/captura.png -o actual.png
```

## 4(extra) ejecutar en segundo plano

```
node server.js &
```

## en caso de que haya otro server hay que matarlo:

```
fuser -k 8002/tcp
```
