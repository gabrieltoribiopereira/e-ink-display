#!/usr/bin/env node
/**
 * Genera web/config.js para el despliegue estatico (Netlify).
 *
 * En local ese archivo vive en secrets/ y lo sirve server.js; aqui se escribe
 * dentro de web/ porque Netlify solo publica esa carpeta.
 *
 * Solo se escriben datos PUBLICOS. La URL del calendario ya no va aqui: se
 * sirve sin login, asi que cualquiera podria leerla y con ella el calendario
 * entero. Vive en la tabla `ajustes` de Supabase, protegida por RLS.
 *
 * Variables de entorno (Netlify -> Site settings -> Environment variables):
 *   SUPABASE_URL
 *   SUPABASE_ANON_KEY      publica por diseno: lo que protege los datos es RLS
 */
const fs = require('fs')
const path = require('path')

const DESTINO = path.join(__dirname, '..', 'web', 'config.js')

const url = process.env.SUPABASE_URL
const anon = process.env.SUPABASE_ANON_KEY

if (!url || !anon) {
    console.error('ERROR: faltan SUPABASE_URL y/o SUPABASE_ANON_KEY')
    console.error('  Netlify -> Site configuration -> Environment variables')
    process.exit(1)
}

if (/service_role/.test(anon) || anon.startsWith('sb_secret')) {
    // Esta clave se salta RLS: publicarla en un archivo estatico daria a
    // cualquiera acceso total a la base de datos.
    console.error('ERROR: SUPABASE_ANON_KEY parece la clave de servicio. Usa la anon.')
    process.exit(1)
}

fs.writeFileSync(DESTINO, `// Generado por scripts/generar-config.js. No editar a mano.
const CONFIG = {
  SUPABASE_URL: ${JSON.stringify(url)},
  SUPABASE_ANON_KEY: ${JSON.stringify(anon)},
};
`)

console.log(`Escrito ${DESTINO}`)
