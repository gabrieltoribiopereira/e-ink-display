#!/usr/bin/env node
/**
 * Renderiza las 4 pantallas y deja un .bin por cada una en output/frames/.
 *
 * El .bin es lo que descarga el ESP32: 800x480 a 2 bits por pixel = 96000
 * bytes exactos. El .h solo sirve para compilar imagenes dentro del firmware.
 *
 * Genera SIEMPRE las cuatro, aunque solo cambie una. Asi el ESP32 se las
 * descarga todas una vez y cambiar de pantalla con un boton es instantaneo,
 * sin pedirle nada a la red.
 *
 * Necesita la web servida (server.js, vale --solo-web) y trae su propio
 * navegador, para no depender del que abre el server.
 *
 * Uso:
 *   node scripts/generar-frames.js [--url http://localhost:8002]
 */
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const util = require('util')
const { execFile } = require('child_process')
const { chromium } = require('playwright')

const execFileP = util.promisify(execFile)

const RAIZ = path.join(__dirname, '..')
const DESTINO = path.join(RAIZ, 'output', 'frames')
const CONVERSOR = path.join(RAIZ, 'scripts', 'convertirimagenendosbits.py')

const ANCHO = 800   // el panel es apaisado; la web se captura en vertical y el
const ALTO = 480    // conversor la rota 90 grados

const arg = (n, def) => {
    const i = process.argv.indexOf(n)
    return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : def
}
const URL_BASE = arg('--url', 'http://localhost:8002')

// Cada pantalla se pinta a su ritmo: el calendario mete un iframe y los
// habitos cargan otro documento aparte, asi que no vale con capturar y correr.
const PANTALLAS = [
    { id: 'pantalla-inicio', espera: async () => {} },
    {
        id: 'pantalla-calendario',
        espera: async (page) => {
            try {
                await page.frameLocator('#pantalla-calendario')
                    .locator('.dhx_cal_data')
                    .waitFor({ state: 'visible', timeout: 10000 })
            } catch { console.warn('   aviso: el calendario no pinto a tiempo') }
        },
    },
    {
        id: 'pantalla-todo',
        espera: async (page) => {
            // tareas.json ya lo refresco el workflow; aqui solo forzamos que la
            // pagina lo relea, porque pudo cargarlo antes de que se actualizara.
            await page.evaluate(() => cargarTareas()).catch(() => {})
            await page.waitForTimeout(300)
        },
    },
    {
        id: 'pantalla-habitos',
        espera: async (page) => {
            // constancia.js inyecta un .frame dentro de #pantalla-habitos; el div
            // #constancia se queda vacio, asi que esperar por el no sirve de nada.
            try {
                await page.locator('#pantalla-habitos .frame')
                    .waitFor({ state: 'visible', timeout: 10000 })
            } catch { console.warn('   aviso: los habitos no pintaron a tiempo') }
            await page.waitForTimeout(300)
        },
    },
]

function credenciales() {
    // En GitHub Actions llegan por entorno; en local, del archivo de siempre.
    if (process.env.DISPLAY_EMAIL && process.env.DISPLAY_PASSWORD) {
        return { email: process.env.DISPLAY_EMAIL, password: process.env.DISPLAY_PASSWORD }
    }
    const f = path.join(RAIZ, 'secrets', 'display.json')
    if (!fs.existsSync(f)) {
        throw new Error('faltan credenciales: define DISPLAY_EMAIL y DISPLAY_PASSWORD '
            + 'o crea secrets/display.json')
    }
    return JSON.parse(fs.readFileSync(f, 'utf8'))
}

async function iniciarSesion(page) {
    await page.waitForSelector('body[data-auth]', { timeout: 20000 })
    if (await page.getAttribute('body', 'data-auth') === 'in') return
    const cuenta = credenciales()
    await page.fill('#email', cuenta.email)
    await page.fill('#password', cuenta.password)
    await page.click('#btn-login')
    try {
        await page.locator('#dashboard').waitFor({ state: 'visible', timeout: 20000 })
    } catch {
        const msg = await page.locator('#login-error').textContent()
        throw new Error('no se pudo iniciar sesion: ' + (msg || 'timeout'))
    }
    console.log('Sesion iniciada como', cuenta.email)
}

async function generar() {
    fs.mkdirSync(DESTINO, { recursive: true })

    const env = { ...process.env }
    delete env.LD_LIBRARY_PATH        // evita la glib vieja que inyecta Zed (Flatpak)
    const browser = await chromium.launch({ env })
    const page = await browser.newPage()

    // ?display=1 marca esta pestaña como la del e-ink (ver web/script.js)
    await page.goto(`${URL_BASE}/?display=1`, { waitUntil: 'networkidle' })
    await iniciarSesion(page)

    const manifiesto = { generado: new Date().toISOString(), ancho: ANCHO, alto: ALTO, bpp: 2, pantallas: {} }

    for (const { id, espera } of PANTALLAS) {
        const corto = id.replace('pantalla-', '')
        process.stdout.write(`-> ${corto}\n`)

        await page.evaluate((x) => mostrar(x), id)
        await page.waitForTimeout(400)
        await espera(page)

        const png = path.join(DESTINO, `${corto}.png`)
        const bin = path.join(DESTINO, `${corto}.bin`)
        const el = await page.$('.contenedor')
        if (!el) throw new Error('no aparece .contenedor: la sesion no esta activa')
        fs.writeFileSync(png, await el.screenshot({ type: 'png' }))

        // El conversor necesita Pillow, que esta en el python del SISTEMA (no en
        // el venv, que solo tiene las librerias de Google).
        await execFileP('python3', [
            CONVERSOR, png, '--width', String(ANCHO), '--height', String(ALTO),
            '--name', corto, '--bin', bin,
        ])

        const datos = fs.readFileSync(bin)
        const hash = crypto.createHash('sha256').update(datos).digest('hex')
        manifiesto.pantallas[corto] = { bytes: datos.length, hash }

        const esperado = ANCHO * ALTO * 2 / 8
        if (datos.length !== esperado) {
            throw new Error(`${corto}.bin mide ${datos.length} bytes y deberia medir ${esperado}`)
        }
        console.log(`   ${datos.length} bytes  sha256:${hash.slice(0, 16)}`)
    }

    fs.writeFileSync(path.join(DESTINO, 'manifest.json'), JSON.stringify(manifiesto, null, 2))
    await browser.close()
    console.log(`\nListo: ${Object.keys(manifiesto.pantallas).length} frames en ${DESTINO}`)
}

generar().catch(e => { console.error('ERROR:', e.message); process.exit(1) })
