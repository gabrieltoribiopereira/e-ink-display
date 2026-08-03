const CAL_BASE = "https://open-web-calendar.hosted.quelltext.eu/calendar.html";
const CAL_ICS = CONFIG.ICS;

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

function calCargar() {
  if (calCargado) return;
  const src = `${CAL_BASE}?language=es`
    + `&skin=flat`
    + `&title=Calendario`
    + `&tab=day&tabs=day&tabs=week`
    + `&javascript=${encodeURIComponent(CAL_JS)}`
    + `&url=${encodeURIComponent(CAL_ICS)}`;
  const f = document.getElementById("pantalla-calendario");
  f.addEventListener("load", () => {
    calListo = true;
    calCola.splice(0).forEach(calEnviar);
  });
  f.src = src;
  calCargado = true;
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
