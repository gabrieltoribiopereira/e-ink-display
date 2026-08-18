// Solo son el ultimo recurso: los valores de verdad salen de la tabla `ajustes`
// de Supabase, y la primera vez se siembran desde secrets/config.js. Tienen que
// ser numeros validos igualmente, porque si esta linea falla se aborta el archivo
// entero y se quedan sin clima Y sin calendario.
const AJUSTES_POR_DEFECTO = { ics: "", lat: 41.6, lon: 2.3 };

let ajustesCache = null;
let ajustesPromesa = null;

function cargarAjustes() {
  if (ajustesCache) return Promise.resolve(ajustesCache);
  if (ajustesPromesa) return ajustesPromesa;

  ajustesPromesa = (async () => {
    try {
      return await leer();
    } finally {

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

function olvidarAjustes() {
  ajustesCache = null;
  ajustesPromesa = null;
}
