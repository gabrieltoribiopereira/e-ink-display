const http = require('http')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { chromium } = require('playwright')

const { execFile } = require('child_process')
const util = require('util')
const execFileP=util.promisify(execFile)

const WEB = path.join(__dirname, '..', 'web')   // estáticos
const OUT = path.join(__dirname, '..', 'output') // capturas
const PORT = 8002
const SECRETS = path.join(__dirname, '..', 'secrets')
const DATA    = path.join(__dirname, '..', 'data')
const EXTRA = {
    '/config.js':   path.join(SECRETS, 'config.js'),
    '/tareas.json': path.join(DATA, 'tareas.json'),
}
const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
}

let page = null


let estado = {
    pantalla: 'pantalla-inicio',
    vista: 'day',
    scroll: 0,
    seleccion: 0,
}


const VENV_PY = path.join(__dirname, '..', '.venv', 'bin', 'python')
// El venv si existe (asi es como se instala en local siguiendo el README), y si
// no el del sistema (en CI las dependencias van directas al python del runner).
// Antes el conversor se llamaba con 'python3' a secas y solo funcionaba en
// maquinas que ya tuvieran Pillow instalado a nivel de sistema.
const PYTHON = fs.existsSync(VENV_PY) ? VENV_PY : 'python3'
const GTASKS = path.join(__dirname, '..', 'scripts', 'gtasks.py')
const TOKEN_GOOGLE = path.join(SECRETS, 'token.json')
const TAREAS_TTL = 10 * 60 * 1000   // no llamar a la API de Google mas de una vez cada 10 min
let ultimaSync = 0


function credencialesSupabase() {
    const env = {}
    try {
        const cfg = fs.readFileSync(path.join(SECRETS, 'config.js'), 'utf8')
        env.SUPABASE_URL = cfg.match(/SUPABASE_URL:\s*["']([^"']+)["']/)?.[1]
        env.SUPABASE_ANON_KEY = cfg.match(/SUPABASE_ANON_KEY:\s*["']([^"']+)["']/)?.[1]
        const cuenta = JSON.parse(fs.readFileSync(path.join(SECRETS, 'display.json'), 'utf8'))
        env.DISPLAY_EMAIL = cuenta.email
        env.DISPLAY_PASSWORD = cuenta.password
    } catch { /* sin secrets: gtasks.py avisa y guarda solo el archivo local */ }
    return Object.fromEntries(Object.entries(env).filter(([, v]) => v))
}

async function actualizarTareas({ forzar = false } = {}) {
    if (!forzar && Date.now() - ultimaSync < TAREAS_TTL) return
    if (!fs.existsSync(TOKEN_GOOGLE)) {
        console.warn('AVISO: falta secrets/token.json, las tareas no se sincronizan.')
        console.warn('       Autoriza una vez:  .venv/bin/python scripts/gtasks.py')
        return
    }
    if (!fs.existsSync(VENV_PY)) {
        console.warn(`AVISO: no existe ${VENV_PY}, las tareas no se sincronizan.`)
        return
    }
    ultimaSync = Date.now()   // se marca aunque falle, para no reintentar en cada captura
    try {

        const { stdout } = await execFileP(VENV_PY, [GTASKS, '--auto'],
            { timeout: 30000, env: { ...process.env, ...credencialesSupabase() } })
        console.log('Tareas sincronizadas:', stdout.trim())
    } catch (e) {
        console.warn('No se pudieron sincronizar las tareas:',
            (e.stderr || e.message).trim().split('\n').pop())
    }
}

async function initBrowser() {
    const env = { ...process.env }
    delete env.LD_LIBRARY_PATH
    const browser = await chromium.launch({ env })
    page = await browser.newPage()
    await page.goto(`http://localhost:${PORT}/?display=1`, { waitUntil: 'networkidle' })
    await iniciarSesion()
    console.log('Navegador listo')
}


async function iniciarSesion() {
    let cuenta
    try {
        cuenta = JSON.parse(fs.readFileSync(path.join(SECRETS, 'display.json'), 'utf8'))
    } catch {
        console.warn('AVISO: falta secrets/display.json, no se inicia sesion.')
        console.warn('       Si la web tiene el login activo, las capturas fallaran.')
        return
    }
    // Login y dashboard arrancan ocultos hasta que Supabase resuelve la sesion.
    await page.waitForSelector('body[data-auth]', { timeout: 15000 })
    if (await page.getAttribute('body', 'data-auth') === 'in') return   // ya habia sesion
    await page.fill('#email', cuenta.email)
    await page.fill('#password', cuenta.password)
    await page.click('#btn-login')
    try {
        await page.locator('#dashboard').waitFor({ state: 'visible', timeout: 15000 })
        console.log('Sesion iniciada como', cuenta.email)
    } catch {
        const msg = await page.locator('#login-error').textContent()
        throw new Error('No se pudo iniciar sesion: ' + (msg || 'timeout'))
    }
}
// capturar la pantalla
async function capturar() {
    if (!(await page.locator('#dashboard').isVisible())) {
        throw new Error('Dashboard oculto: el navegador del server no tiene sesion. '
            + 'Crea secrets/display.json con {"email": "...", "password": "..."}')
    }
    const modo = await page.evaluate(() => document.querySelector('.pantalla.activa')?.id)
    // Si vamos a capturar el To-Do, refrescar antes desde Google Tasks. No basta
    // con reescribir tareas.json: la pagina ya lo leyo, hay que pedirle que lo
    // vuelva a cargar.
    if (modo === 'pantalla-todo') {
        await actualizarTareas()
        await page.evaluate(() => cargarTareas())
        await page.waitForTimeout(200)
    }
    // Los habitos vienen de Supabase: el marco aparece antes que los datos, asi
    // que hay que esperar a la marca que pone iniciarHabitos al terminar.
    if (modo === 'pantalla-habitos') {
        try {
            await page.locator('#pantalla-habitos .frame[data-cargado]')
                .waitFor({ state: 'visible', timeout: 15000 })
        } catch (e) {}
    }
    // El calendario pinta la cuadricula vacia y mete los eventos ~500 ms
    // despues, asi que no basta con esperar a que sea visible: se capturaria el
    // spinner. Se espera ademas a que el HTML deje de cambiar.
    if (modo === 'pantalla-calendario') {
        const rejilla = page.frameLocator('#pantalla-calendario').locator('.dhx_cal_data')
        try {
            await rejilla.waitFor({ state: 'visible', timeout: 15000 })
            let previo = null
            for (let i = 0; i < 15; i++) {
                const ahora = await rejilla.innerHTML().catch(() => null)
                if (ahora !== null && ahora === previo) break
                previo = ahora
                await page.waitForTimeout(400)
            }
        } catch (e) {}
    }
    const el = await page.$('.contenedor')
    return await el.screenshot({ type: 'png' })
}

async function guardarYConvertir(imgBuffer, nombre = 'captura') {
  // output/ no esta en el repo, asi que en un clon recien hecho no existe y
  // writeFileSync fallaria con ENOENT.
  fs.mkdirSync(OUT, { recursive: true })
  const pngPath = path.join(OUT, `${nombre}.png`)
  const hPath   = path.join(OUT, `${nombre}.h`)
  fs.writeFileSync(pngPath, imgBuffer)
      await execFileP(PYTHON, [
          path.join(__dirname, '..', 'scripts', 'convertirimagenendosbits.py'),
          pngPath,
          '--width', '800', '--height', '480',
          '--name', nombre,
          '--out', hPath,
      ])
      console.log(`Convertido ${nombre}.png -> ${nombre}.h`)
}

// API del ESP32
const FRAMES = path.join(OUT, 'frames')
const CONVERSOR = path.join(__dirname, '..', 'scripts', 'convertirimagenendosbits.py')
const RUTA_TOKEN = path.join(SECRETS, 'device-token.txt')
const DEVICE_TOKEN = (process.env.DEVICE_TOKEN
    || (fs.existsSync(RUTA_TOKEN) ? fs.readFileSync(RUTA_TOKEN, 'utf8') : '')).trim()


const PANTALLAS = ['inicio', 'calendario', 'todo', 'habitos']

function autorizado(req) {
    if (!DEVICE_TOKEN) return true
    const enviado = (req.headers.authorization || '').replace(/^Bearer /, '')
    const a = Buffer.from(enviado)
    const b = Buffer.from(DEVICE_TOKEN)
    return a.length === b.length && crypto.timingSafeEqual(a, b)
}


async function guardarFrame(imgBuffer, pantalla) {
    fs.mkdirSync(FRAMES, { recursive: true })
    const png = path.join(FRAMES, `${pantalla}.png`)
    const bin = path.join(FRAMES, `${pantalla}.bin`)
    const h = path.join(FRAMES, `${pantalla}.h`)
    fs.writeFileSync(png, imgBuffer)
    await execFileP(PYTHON, [CONVERSOR, png,
        '--width', '800', '--height', '480', '--name', pantalla, '--out', h, '--bin', bin])
    const datos = fs.readFileSync(bin)
    return { pantalla, bytes: datos.length, hash: crypto.createHash('sha256').update(datos).digest('hex') }
}

const json = (res, code, obj) => {
    res.statusCode = code
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.end(JSON.stringify(obj))
}

const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`)

    if (url.pathname.startsWith('/api/')) {
        if (!autorizado(req)) return json(res, 401, { error: 'token invalido' })


        if (url.pathname === '/api/boton' && req.method === 'POST') {
            let body = ''
            req.on('data', c => (body += c))
            req.on('end', async () => {
                if (!page) return json(res, 503, { error: 'navegador no listo' })
                let n
                try { n = JSON.parse(body).boton } catch { n = parseInt(body.trim(), 10) }
                if (!(n >= 1 && n <= 4)) return json(res, 400, { error: 'boton debe ser 1..4' })
                try {
                    await page.locator('.boton').nth(n - 1).click()
                    await page.waitForTimeout(300)
                    const img = await capturar()
                    const activa = await page.evaluate(() => document.querySelector('.pantalla.activa')?.id)
                    res.setHeader('Cache-Control', 'no-store')
                    json(res, 200, await guardarFrame(img, activa.replace('pantalla-', '')))
                } catch (e) {
                    json(res, 500, { error: e.message })
                }
            })
            return
        }


        if (url.pathname === '/api/estado' && req.method === 'GET') {
            const pantalla = estado.pantalla.replace('pantalla-', '')
            const bin = path.join(FRAMES, `${pantalla}.bin`)
            if (!fs.existsSync(bin)) return json(res, 404, { error: 'frame no generado todavia', pantalla })
            const datos = fs.readFileSync(bin)
            return json(res, 200, {
                pantalla, bytes: datos.length,
                hash: crypto.createHash('sha256').update(datos).digest('hex'),
            })
        }

        // Descarga del frame: .bin son los 96000 bytes crudos, .h el array de C
        const m = url.pathname.match(/^\/api\/frame\/([a-z]+)\.(bin|h)$/)
        if (m && req.method === 'GET') {
            const [, pantalla, ext] = m
            if (!PANTALLAS.includes(pantalla)) return json(res, 404, { error: 'pantalla desconocida' })
            const archivo = path.join(FRAMES, `${pantalla}.${ext}`)
            if (!fs.existsSync(archivo)) return json(res, 404, { error: 'frame no generado todavia' })
            const datos = fs.readFileSync(archivo)
            const etag = '"' + crypto.createHash('sha256').update(datos).digest('hex').slice(0, 32) + '"'

            if (req.headers['if-none-match'] === etag) {
                res.statusCode = 304
                res.setHeader('ETag', etag)
                return res.end()
            }
            res.setHeader('ETag', etag)
            res.setHeader('Content-Type', ext === 'bin' ? 'application/octet-stream' : 'text/plain; charset=utf-8')
            res.setHeader('Content-Length', datos.length)
            return res.end(datos)
        }

        return json(res, 404, { error: 'ruta no encontrada' })
    }

    // Pulsar un boton (1..4) y devolver la NUEVA captura
    if (url.pathname === '/boton' && req.method === 'POST') {
        let body = ''
        req.on('data', c => (body += c))
        req.on('end', async () => {
            if (!page) { res.statusCode = 503; return res.end('Navegador no listo') }
            const i = parseInt(body.trim(), 10) - 1   // boton 1..4 -> indice 0..3
            try {
                await page.locator('.boton').nth(i).click()
                await page.waitForTimeout(300)
                const img = await capturar()
                await guardarYConvertir(img, `boton${i + 1}`)   // <-- convierte tras generar
                res.setHeader('Content-Type', 'image/png')
                res.end(img)
            } catch (e) {
                res.statusCode = 500
                res.end('Error: ' + e.message)
            }
        })
        return
    }

    // Captura de la pantalla actual (sin pulsar nada)
    if (url.pathname === '/captura.png' && req.method === 'GET') {
        if (!page) { res.statusCode = 503; return res.end('Navegador no listo') }
        capturar()
            .then(async img => {
                await guardarYConvertir(img, 'captura')   // <-- guarda y convierte
                res.setHeader('Content-Type', 'image/png')
                res.end(img)
            })
            .catch(e => { res.statusCode = 500; res.end('Error: ' + e.message) })
        return
    }

    // Estado del display: la web lo guarda aqui para restaurarlo al recargar
    if (url.pathname === '/pantalla') {
        if (req.method === 'POST') {
            let body = ''
            req.on('data', c => (body += c))
            req.on('end', () => {
                try {
                    Object.assign(estado, JSON.parse(body))
                } catch {
                    estado.pantalla = body.trim()   // formato viejo: solo el id
                }
                res.end('ok')
            })
            return
        }
        return json(res, 200, estado)
    }

    // Archivos estaticos
    let rel = decodeURIComponent(url.pathname)
    if (rel.endsWith('/')) rel += 'index.html'

    let file = EXTRA[rel]
    if (!file) {
        file = path.join(WEB, path.normalize(rel))
        if (!file.startsWith(WEB)) { res.statusCode = 403; return res.end('Prohibido') }
    }
    fs.readFile(file, (err, data) => {
        if (err) { res.statusCode = 404; return res.end('No encontrado') }
        res.setHeader('Content-Type', MIME[path.extname(file)] || 'application/octet-stream')
        res.end(data)
    })
})


const SOLO_WEB = process.argv.includes('--solo-web')

server.listen(PORT, async () => {
    console.log(`Servidor en http://localhost:${PORT}`)
    if (SOLO_WEB) {
        console.log('Modo solo-web: sin navegador. /boton y /captura.png no funcionan.')
        return
    }
    await initBrowser()
    await actualizarTareas({ forzar: true })
    setInterval(() => actualizarTareas({ forzar: true }), TAREAS_TTL).unref()
})
