let tareasActuales = [];
let seleccion = 0;
let seleccionPendiente = null;   // la que llega del server al restaurar estado

// La llama script.js al arrancar, antes de que se pinte nada.
function todoRestaurar(i) { seleccionPendiente = i; }

async function cargarTareas() {
  const cont = document.getElementById("lista-tareas");
  try {
    const res = await fetch("tareas.json?t=" + Date.now());
    const datos = await res.json();
    tareasActuales = datos.flatMap(l => l.tareas);
    // Se acota a la lista actual: la tarea guardada pudo desaparecer de Google
    // Tasks desde la ultima vez, y quedaria una seleccion apuntando a la nada.
    const guardada = seleccionPendiente ?? seleccion;
    seleccion = tareasActuales.length
      ? Math.min(guardada, tareasActuales.length - 1)
      : 0;
    seleccionPendiente = null;
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
  publicarEstado({ seleccion });
  pintarTareas();
}

// Solo marca en pantalla: gtasks.py usa el scope de solo lectura, asi que el
// cambio se pierde al recargar tareas.json.
function marcarHecha() {
  const t = tareasActuales[seleccion];
  if (!t) return;
  t.estado = t.estado === "completed" ? "needsAction" : "completed";
  pintarTareas();
}
