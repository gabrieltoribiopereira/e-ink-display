const http = require('http')
const fs = require('fs')
const path = require('path')
const { chromium } = require('playwright')

const { execFile } = require('child_process')
const util = require('util')
const execFileP=util.promisify(execFile)

const DIR = __dirname
const PORT = 8080

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

let page = null   // pagina persistente: el navegador se abre UNA sola vez

async function initBrowser() {
    const env = { ...process.env }
    delete env.LD_LIBRARY_PATH        // evita la glib vieja que inyecta Zed (Flatpak)
    const browser = await chromium.launch({ env })
    page = await browser.newPage()
    await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' })
    console.log('Navegador listo')
}

async function capturar() {
    // Si estamos en el calendario, esperar a que el iframe pinte la cuadricula
    const modo = await page.evaluate(() => document.querySelector('.pantalla.activa')?.id)
    if (modo === 'pantalla-calendario') {
        try {
            await page.frameLocator('#pantalla-calendario')
                .locator('.dhx_cal_data')
                .waitFor({ state: 'visible', timeout: 8000 })
        } catch (e) {}
    }
    const el = await page.$('.contenedor')
    return await el.screenshot({ type: 'png' })
}

async function guardarYConvertir(imgBuffer, nombre = 'captura') {
  const pngPath = path.join(DIR, `${nombre}.png`)
  const hPath = path.join(DIR, `${nombre}.h`)
  fs.writeFileSync(pngPath, imgBuffer)          // 1) guarda la imagen
      await execFileP('python3', [                  // 2) ejecuta el .py
          path.join(process.env.HOME, 'img2carray_4gray.py'),
          pngPath,
          '--width', '800', '--height', '480',
          '--name', nombre,
          '--out', hPath,
      ])
      console.log(`Convertido ${nombre}.png -> ${nombre}.h`)
}

const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`)

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

    // Archivos estaticos
    let rel = decodeURIComponent(url.pathname)
    if (rel.endsWith('/')) rel += 'index.html'
    const file = path.join(DIR, path.normalize(rel))
    if (!file.startsWith(DIR)) { res.statusCode = 403; return res.end('Prohibido') }
    fs.readFile(file, (err, data) => {
        if (err) { res.statusCode = 404; return res.end('No encontrado') }
        res.setHeader('Content-Type', MIME[path.extname(file)] || 'application/octet-stream')
        res.end(data)
    })
})

server.listen(PORT, async () => {
    console.log(`Servidor en http://localhost:${PORT}`)
    await initBrowser()
})
