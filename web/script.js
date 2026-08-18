//Botones. Creo que no voy a cambiar el diseño porque que palo de todas maneras no voy a interactuar con los botones de normal
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
