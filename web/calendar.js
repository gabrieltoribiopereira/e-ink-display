const CAL_BASE = "https://open-web-calendar.hosted.quelltext.eu/calendar.html";

const CAL_JS = `
window.addEventListener("message", function (e) {
  var d = e.data;
  if (!d || !d.owc) return;
  if (d.accion === "scroll") {
    var c = document.querySelector(".dhx_cal_data");
    if (c) c.scrollTop += d.px;
  }
  if (d.accion === "vista") {
    scheduler.setCurrentView(scheduler.getState().date, d.vista);
  }
});
`;

let calVista = "day";
let calCargado = false;
let calListo = false;
const calCola = [];

async function calCargar() {
  if (calCargado) return;
  // La URL del ICS ya no esta en config.js: se pide a Supabase tras el login.
  const { ics } = await cargarAjustes();
  if (!ics) {
    console.warn("calendario: no hay ICS configurado en la tabla ajustes");
    return;
  }
  calCargado = true;   // se marca aqui: sin esto, dos llamadas seguidas mientras
                       // se esperan los ajustes cargarian el iframe dos veces
  const src = `${CAL_BASE}?language=es`
    + `&skin=flat`
    + `&title=Calendario`
    + `&tab=day&tabs=day&tabs=week`
    + `&javascript=${encodeURIComponent(CAL_JS)}`
    + `&url=${encodeURIComponent(ics)}`;
  const f = document.getElementById("pantalla-calendario");
  f.addEventListener("load", () => {
    calListo = true;
    calCola.splice(0).forEach(calEnviar);
  });
  f.src = src;
}

function calEnviar(msg) {
  if (!calListo) { calCola.push(msg); return; }
  document.getElementById("pantalla-calendario")
    .contentWindow.postMessage({ owc: true, ...msg }, "*");
}

// El iframe desplaza en relativo (scrollTop += px), asi que aqui se lleva la
// cuenta acumulada: es lo que permite reproducir la posicion en un navegador
// nuevo, mandando el total de una vez sobre un iframe recien cargado.
let calScrollTotal = 0;

function calScroll(px) {
  calScrollTotal = Math.max(0, calScrollTotal + px);
  calEnviar({ accion: "scroll", px });
  publicarEstado({ scroll: calScrollTotal });
}

function calToggleVista() {
  calVista = calVista === "day" ? "week" : "day";
  calEnviar({ accion: "vista", vista: calVista });
  publicarEstado({ vista: calVista });
}

// Recupera vista y scroll guardados. Lo llama script.js al arrancar; los
// mensajes se encolan solos si el iframe todavia no ha cargado.
function calRestaurar({ vista, scroll }) {
  if (vista && vista !== calVista) {
    calVista = vista;
    calEnviar({ accion: "vista", vista });
  }
  if (scroll) {
    calScrollTotal = scroll;
    calEnviar({ accion: "scroll", px: scroll });
  }
}
