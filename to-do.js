let tareasActuales = [];
let seleccion = 0;

async function cargarTareas() {
  const cont = document.getElementById("lista-tareas");
  try {
    const res = await fetch("tareas.json?t=" + Date.now());
    const datos = await res.json();
    tareasActuales = datos.flatMap(l => l.tareas);
    seleccion = 0;
    pintarTareas();
  } catch (e) {
    cont.textContent = "Error al cargar tareas";
    console.error(e);
  }
}

function pintarTareas() {
  const cont = document.getElementById("lista-tareas");
  cont.innerHTML = "";

  if (!tareasActuales.length) {
    cont.textContent = "Nada para hoy";
    return;
  }

  tareasActuales.forEach((t, i) => {
    const div = document.createElement("div");
    div.className = "tarea";
    if (t.estado === "completed") div.classList.add("hecha");
    if (i === seleccion) div.classList.add("seleccionada");

    const check = t.estado === "completed" ? "☑" : "☐";
    div.innerHTML = `<span class="titulo">${check} ${t.titulo}</span>`;

    if (t.vence) {
      const f = new Date(t.vence);
      const dia = f.toLocaleDateString("es-ES", {
        weekday: "long", day: "numeric", month: "long", timeZone: "UTC"
      });
      div.innerHTML += `<span class="fecha">${dia}</span>`;
    }

    cont.appendChild(div);
  });
}

function moverSeleccion(delta) {
  if (!tareasActuales.length) return;
  seleccion = (seleccion + delta + tareasActuales.length) % tareasActuales.length;
  pintarTareas();
}
