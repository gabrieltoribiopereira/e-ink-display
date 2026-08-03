const pantallas = {
  "pantalla-inicio": [
    { emoji: "🏠", texto: "Start",  accion: () => mostrar("pantalla-inicio") },
    { emoji: "📅", texto: "Calendar",  accion: () => mostrar("pantalla-calendario") },
    { emoji: "✅", texto: "To-Do",  accion: () => mostrar("pantalla-todo") },
    { emoji: "🔥", texto: "habits",  accion: () => mostrar("pantalla-habitos") }
  ],
  "pantalla-calendario": [
      { emoji: "🏠", texto: "Start",  accion: () => mostrar("pantalla-inicio") },
      { emoji: "🔼", texto: "Up",  accion: () => calScroll(-300) },
      { emoji: "🔽", texto: "Down",  accion: () => calScroll(300) },
      { emoji: "🗓️", texto: "View",  accion: calToggleVista }
    ],
    "pantalla-todo": [
       { emoji: "🏠", texto: "Start",  accion: () => mostrar("pantalla-inicio") },
       { emoji: "🔼", texto: "Up",     accion: () => moverSeleccion(-1) },
       { emoji: "🔽", texto: "Down",   accion: () => moverSeleccion(1) },
       { emoji: "✔️", texto: "Done",   accion: () => marcarHecha() } /* falta definir */
     ],
  "pantalla-habitos": [
    { emoji: "🏠", texto: "Start",  accion: () => mostrar("pantalla-inicio") },
    { emoji: "➕", texto: "Vista",  accion: () => console.log("nuevo hábito") },
    { emoji: "📊", texto: "Bajar",  accion: () => console.log("racha") },
    { emoji: "⚙️", texto: "Marcar",  accion: () => console.log("ajustes") }
  ]
};

let modo = "pantalla-inicio";

// Solo el navegador del server (el que genera las capturas y los .h) lleva
// ?display=1. El estado de /pantalla es el del e-ink, asi que unicamente ese
// navegador puede leerlo y escribirlo: si lo tocara cualquier pestaña abierta,
// navegar por la web moveria el display, y viceversa.
const ES_DISPLAY = new URLSearchParams(location.search).has("display");

document.querySelectorAll(".boton").forEach((boton, i) => {
  boton.addEventListener("click", () => pantallas[modo][i].accion());
});



function render() {
  const celdas = document.querySelectorAll(".barra span")
  document.querySelectorAll(".boton").forEach((boton, i) => {
    const cfg = pantallas[modo][i];
    boton.textContent = cfg.emoji;
    celdas[i].textContent = cfg.texto;
  });
}

// Estado completo del display. No basta con la pantalla activa: si solo se
// guardara eso, al recargar el calendario volveria a vista día y el To-Do a la
// primera tarea. En la nube, donde cada renderizado abre un navegador nuevo,
// eso haría inservibles los botones que cambian el detalle de una pantalla.
const estado = { pantalla: "pantalla-inicio", vista: "day", scroll: 0, seleccion: 0 };

function publicarEstado(cambios) {
  Object.assign(estado, cambios);
  if (!ES_DISPLAY) return;
  fetch("/pantalla", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(estado),
  }).catch(() => {});
}

// Al cargar: el display restaura el estado guardado en el servidor; una pestaña
// normal empieza siempre en inicio, sin consultar ni tocar nada.
if (ES_DISPLAY) {
  fetch("/pantalla")
    .then(r => r.json())
    .then(guardado => {
      Object.assign(estado, guardado);
      // El calendario y el To-Do tienen que recuperar su detalle ANTES de que
      // se pinte la pantalla, o la captura saldria con el estado por defecto.
      if (typeof calRestaurar === "function") calRestaurar(estado);
      if (typeof todoRestaurar === "function") todoRestaurar(estado.seleccion);
      mostrar(document.getElementById(estado.pantalla) ? estado.pantalla : "pantalla-inicio");
    })
    .catch(() => mostrar("pantalla-inicio"));
} else {
  mostrar("pantalla-inicio");
}

function mostrar(id) {
  modo = id;
  publicarEstado({ pantalla: id });
  if (id === "pantalla-calendario") calCargar();
  if (id === "pantalla-todo") cargarTareas();
  document.querySelectorAll(".pantalla").forEach(p => p.classList.remove("activa"));
  document.getElementById(id).classList.add("activa");
  render();
}
