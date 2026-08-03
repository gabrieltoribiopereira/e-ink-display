#!/usr/bin/env node
/**
 * Sube output/frames/ a Supabase Storage.
 *
 * Habla con la API REST de Storage a pelo en vez de usar @supabase/supabase-js:
 * son cuatro PUT y asi el proyecto no arrastra una dependencia mas.
 *
 * Variables de entorno (en local salen de secrets/, en CI de los secrets de
 * GitHub):
 *   SUPABASE_URL             https://xxxx.supabase.co
 *   SUPABASE_SERVICE_ROLE    clave con permiso de escritura (nunca en la web)
 *   SUPABASE_BUCKET          opcional, por defecto "frames"
 *
 * Uso:
 *   node scripts/subir-frames.js
 */
const fs = require('fs')
const path = require('path')

const RAIZ = path.join(__dirname, '..')
const ORIGEN = path.join(RAIZ, 'output', 'frames')
const BUCKET = process.env.SUPABASE_BUCKET || 'frames'

function config() {
    let url = process.env.SUPABASE_URL
    const clave = process.env.SUPABASE_SERVICE_ROLE

    // En local se puede sacar la URL de secrets/config.js; la clave de servicio
    // no vive ahi a proposito (esa solo debe estar en los secrets de GitHub).
    if (!url) {
        const f = path.join(RAIZ, 'secrets', 'config.js')
        if (fs.existsSync(f)) {
            const m = fs.readFileSync(f, 'utf8').match(/SUPABASE_URL:\s*["']([^"']+)["']/)
            if (m) url = m[1]
        }
    }
    if (!url) salir('falta SUPABASE_URL')
    if (!clave) salir('falta SUPABASE_SERVICE_ROLE (la clave que puede saltarse RLS)')
    return { url: url.replace(/\/$/, ''), clave }
}

const salir = (msg) => { console.error('ERROR: ' + msg); process.exit(1) }

async function subir({ url, clave }, archivo, tipo) {
    const datos = fs.readFileSync(path.join(ORIGEN, archivo))
    const destino = `${url}/storage/v1/object/${BUCKET}/${archivo}`
    const r = await fetch(destino, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${clave}`,
            'Content-Type': tipo,
            'x-upsert': 'true',      // sobrescribe: cada ejecucion reemplaza el frame
        },
        body: datos,
    })
    if (!r.ok) {
        const cuerpo = await r.text()
        if (r.status === 404) {
            salir(`el bucket "${BUCKET}" no existe.\n`
                + '  Crealo en Supabase -> Storage -> New bucket, con Public DESACTIVADO')
        }
        salir(`${archivo} -> HTTP ${r.status}: ${cuerpo.slice(0, 200)}`)
    }
    return datos.length
}

async function main() {
    if (!fs.existsSync(ORIGEN)) {
        salir(`no existe ${ORIGEN}\n  genera los frames antes:  node scripts/generar-frames.js`)
    }
    const cfg = config()
    const manifiesto = path.join(ORIGEN, 'manifest.json')
    if (!fs.existsSync(manifiesto)) salir('falta manifest.json; regenera los frames')

    const pantallas = Object.keys(JSON.parse(fs.readFileSync(manifiesto, 'utf8')).pantallas)
    console.log(`Subiendo a ${cfg.url} (bucket "${BUCKET}")`)

    let total = 0
    for (const p of pantallas) {
        total += await subir(cfg, `${p}.bin`, 'application/octet-stream')
        console.log(`  ${p}.bin  96000 bytes`)
    }
    // El manifiesto va el ULTIMO a proposito: es lo que consulta el ESP32 para
    // decidir si descarga. Si se subiera antes, podria anunciar hashes de frames
    // que todavia no estan arriba y el ESP32 se bajaria datos viejos.
    total += await subir(cfg, 'manifest.json', 'application/json')
    console.log('  manifest.json')

    console.log(`\nListo: ${pantallas.length} frames (${(total / 1024).toFixed(0)} KB)`)
}

main().catch(e => salir(e.message))
