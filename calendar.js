const CAL_BASE = "https://open-web-calendar.hosted.quelltext.eu/calendar.html";
const CAL_ICS = "https://calendar.google.com/calendar/ical/19cda81df0b9e0c89078ff7831af7bd03ed0de75d581db124c4cdd972e083dc4%40group.calendar.google.com/private-d81b828977bc867c91286aab4702a82a/basic.ics";

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

function calScroll(px) { calEnviar({ accion: "scroll", px }); }

function calToggleVista() {
  calVista = calVista === "day" ? "week" : "day";
  calEnviar({ accion: "vista", vista: calVista });
}
