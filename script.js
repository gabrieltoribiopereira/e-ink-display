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
       { emoji: "✔️", texto: "Done",   accion: () => marcarHecha() }
     ],
  "pantalla-habitos": [
    { emoji: "🏠", texto: "",  accion: () => mostrar("pantalla-inicio") },
    { emoji: "➕", texto: "",  accion: () => console.log("nuevo hábito") },
    { emoji: "📊", texto: "",  accion: () => console.log("racha") },
    { emoji: "⚙️", texto: "",  accion: () => console.log("ajustes") }
  ]
};

let modo = "pantalla-inicio";

document.querySelectorAll(".boton").forEach((boton, i) => {
  boton.addEventListener("click", () => pantallas[modo][i].accion());
});

function mostrar(id) {
  modo = id;
  if (id === "pantalla-calendario") calCargar();
  document.querySelectorAll(".pantalla").forEach(p => p.classList.remove("activa"));
  document.getElementById(id).classList.add("activa");
  render();
}

function render() {
  const celdas = document.querySelectorAll(".barra span");
  document.querySelectorAll(".boton").forEach((boton, i) => {
    const cfg = pantallas[modo][i];
    boton.textContent = cfg.emoji;
    celdas[i].textContent = cfg.texto;
  });
}

mostrar("pantalla-inicio");

function mostrar(id) {
  modo = id;
  if (id === "pantalla-calendario") calCargar();
  if (id === "pantalla-todo") cargarTareas();
  document.querySelectorAll(".pantalla").forEach(p => p.classList.remove("activa"));
  document.getElementById(id).classList.add("activa");
  render();
}
