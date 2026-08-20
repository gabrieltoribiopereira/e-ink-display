// Edge Function que sirve los frames al ESP32.
//
// El bucket es privado (lleva calendario y tareas), asi que el ESP32 no puede
// leerlo directamente. Esta funcion comprueba su token y le devuelve el archivo.
//
// Se despliega SIN verificacion de JWT, porque el ESP32 no tiene sesion de
// Supabase; la autorizacion la hace este codigo con la cabecera x-device-token.
// Se usa una cabecera propia y no Authorization para que la pasarela de Supabase
// no intente interpretarla como un JWT y rechace la peticion antes de llegar aqui.
//
//   GET /functions/v1/frame              -> manifest.json (~600 bytes)
//   GET /functions/v1/frame?p=todo       -> todo.bin (96000 bytes)
//   Cabecera: x-device-token: <DEVICE_TOKEN>
//
// Desplegar:
//   supabase functions deploy frame --no-verify-jwt
//   supabase secrets set DEVICE_TOKEN=...
import { createClient } from 'jsr:@supabase/supabase-js@2'

const BUCKET = 'frames'
const PANTALLAS = ['inicio', 'calendario', 'calendario-semana', 'todo', 'habitos']

// Comparacion en tiempo constante: con un == normal, el tiempo de respuesta
// delata cuantos caracteres del token son correctos.
function iguales(a: string, b: string): boolean {
    if (a.length !== b.length) return false
    let dif = 0
    for (let i = 0; i < a.length; i++) dif |= a.charCodeAt(i) ^ b.charCodeAt(i)
    return dif === 0
}

Deno.serve(async (req) => {
    const esperado = Deno.env.get('DEVICE_TOKEN') ?? ''
    if (!esperado) {
        return new Response('DEVICE_TOKEN no configurado en la funcion', { status: 500 })
    }
    if (!iguales(req.headers.get('x-device-token') ?? '', esperado)) {
        return new Response('no autorizado', { status: 401 })
    }

    const p = new URL(req.url).searchParams.get('p') ?? 'manifest'
    if (p !== 'manifest' && !PANTALLAS.includes(p)) {
        return new Response('pantalla desconocida', { status: 404 })
    }
    const archivo = p === 'manifest' ? 'manifest.json' : `${p}.bin`

    // SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY los inyecta Supabase solo.
    const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )
    const { data, error } = await supabase.storage.from(BUCKET).download(archivo)
    if (error || !data) {
        return new Response(`no se encuentra ${archivo}: ${error?.message ?? ''}`, { status: 404 })
    }

    return new Response(data, {
        headers: {
            'Content-Type': p === 'manifest' ? 'application/json' : 'application/octet-stream',
            // Sin cache: el ESP32 ya decide con el hash del manifiesto si descarga.
            'Cache-Control': 'no-store',
        },
    })
})
