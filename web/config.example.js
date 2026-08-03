// Copia este archivo a secrets/config.js y rellena los valores.
// El server lo sirve como /config.js (ver EXTRA en server/server.js).
const CONFIG = {
  ICS: "https://calendar.google.com/calendar/ical/.../basic.ics",
  LAT: 41.6,
  LON: 2.3,

  // Panel de Supabase -> Project Settings -> API
  // La anon key es publica por diseno: lo que protege los datos es Row Level
  // Security, no ocultar la clave. Activa RLS antes de meter nada en tablas.
  SUPABASE_URL: "https://xxxxxxxxxxxx.supabase.co",
  SUPABASE_ANON_KEY: "eyJ...",
};
