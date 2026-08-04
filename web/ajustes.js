// Ajustes personales del usuario, guardados en Supabase.
//
// La URL del ICS vivia en config.js, pero ese archivo se sirve SIN login: en un
// despliegue publico (Netlify) cualquiera podria abrir /config.js, sacar la URL
// privada del calendario y leer todos los eventos sin tener cuenta. Aqui se
// piden despues de iniciar sesion y los protege RLS.

const AJUSTES_POR_DEFECTO = { ics: "", lat: 41.6, lon: 2.3 };

let ajustesCache = null;
let ajustesPromesa = null;

// Devuelve siempre la misma promesa: calendar.js y tiempo.js lo llaman a la vez
// y no tiene sentido pedir lo mismo dos veces.
function cargarAjustes() {
  if (ajustesCache) return Promise.resolve(ajustesCache);
  if (ajustesPromesa) return ajustesPromesa;

  ajustesPromesa = (async () => {
    try {
      return await leer();
    } finally {
      // Si no se pudo leer de Supabase (todavia sin sesion), NO se deja la
      // promesa cacheada: si no, quien llame despues del login recibiria para
      // siempre los valores por defecto y el calendario nunca cargaria.
      if (!ajustesCache) ajustesPromesa = null;
    }
  })();

  return ajustesPromesa;
}

async function leer() {
    const db = window.db;
    if (!db) return AJUSTES_POR_DEFECTO;

    const { data: { user } } = await db.auth.getUser();
    if (!user) return AJUSTES_POR_DEFECTO;

    const { data, error } = await db
      .from("ajustes").select("ics,lat,lon").eq("usuario", user.id).maybeSingle();
    if (error) {
      console.warn("ajustes:", error.message);
      return AJUSTES_POR_DEFECTO;
    }

    if (!data) {
      // Primera vez: se siembra con lo que hubiera en config.js, para no tener
      // que reintroducir la URL a mano al migrar.
      const inicial = {
        ics: (typeof CONFIG !== "undefined" && CONFIG.ICS) || "",
        lat: (typeof CONFIG !== "undefined" && CONFIG.LAT) ?? AJUSTES_POR_DEFECTO.lat,
        lon: (typeof CONFIG !== "undefined" && CONFIG.LON) ?? AJUSTES_POR_DEFECTO.lon,
      };
      await db.from("ajustes").upsert({ usuario: user.id, ...inicial });
      ajustesCache = inicial;
      return inicial;
    }

    ajustesCache = data;
    return data;
}

// Al cerrar o cambiar de sesion hay que olvidar lo cacheado: si no, otra cuenta
// en el mismo navegador veria el calendario de la anterior.
function olvidarAjustes() {
  ajustesCache = null;
  ajustesPromesa = null;
}
