/* ---------- CAPA DE DATOS ---------- */

const store = {
  clave: 'constancia',

  cargar() {
    try {
      const raw = localStorage.getItem(this.clave);
      if (!raw) return { habitos: [], registro: {} };
      return JSON.parse(raw);
    } catch {
      return { habitos: [], registro: {} };
    }
  },

  guardar(datos) {
    localStorage.setItem(this.clave, JSON.stringify(datos));
  }
};

let datos = store.cargar();

/* ---------- UTILIDADES ---------- */

const aISO = d => {
  const c = new Date(d);
  c.setMinutes(c.getMinutes() - c.getTimezoneOffset());
  return c.toISOString().slice(0, 10);
};

const hoyISO = () => aISO(new Date());

const nuevoId = () => 'h' + Date.now().toString(36);

/* ---------- ACCIONES ---------- */

function crearHabito(nombre) {
  nombre = nombre.trim();
  if (!nombre) return;
  datos.habitos.push({ id: nuevoId(), nombre, creado: hoyISO() });
  persistir();
}

function borrarHabito(id) {
  datos.habitos = datos.habitos.filter(h => h.id !== id);
  for (const fecha in datos.registro) {
    datos.registro[fecha] = datos.registro[fecha].filter(x => x !== id);
    if (!datos.registro[fecha].length) delete datos.registro[fecha];
  }
  persistir();
}

function alternar(id, fecha = hoyISO()) {
  const dia = datos.registro[fecha] || [];
  const i = dia.indexOf(id);
  if (i === -1) dia.push(id);
  else dia.splice(i, 1);

  if (dia.length) datos.registro[fecha] = dia;
  else delete datos.registro[fecha];

  persistir();
}

function persistir() {
  store.guardar(datos);
  render();
}

/* ---------- NAVEGACION ---------- */

let vistaActual = 'habitos';

const TITULOS = { habitos: 'HÁBITOS', constancia: 'CONSTANCIA' };

function cambiarVista(v) {
  vistaActual = v;
  document.getElementById('titulo').textContent = TITULOS[v];
  document.getElementById('vista-habitos').hidden = v !== 'habitos';
  document.getElementById('vista-constancia').hidden = v !== 'constancia';
  document.querySelectorAll('.nav-btn').forEach(b => {
    b.classList.toggle('activo', b.dataset.vista === v);
  });
  render();
}

/* ---------- RENDER ---------- */

function render() {
  renderMeta();
  if (vistaActual === 'habitos') {
    renderLista();
  } else {
    renderHeatmap();
    renderRacha();
    renderBarras();
    renderFooter();
  }
}

function renderMeta() {
  const d = new Date();
  const el = document.getElementById('meta');

  if (vistaActual === 'habitos') {
    el.textContent = d.toLocaleDateString('es-ES', {
      weekday: 'long', day: 'numeric', month: 'long'
    });
  } else {
    const inicio = new Date(d.getFullYear(), 0, 1);
    const semana = Math.ceil(((d - inicio) / 86400000 + inicio.getDay() + 1) / 7);
    el.textContent = `${d.getFullYear()} · Semana ${semana}`;
  }
}

function renderLista() {
  const ul = document.getElementById('lista');
  const marcados = datos.registro[hoyISO()] || [];
  ul.innerHTML = '';

  if (!datos.habitos.length) {
    ul.innerHTML = '<li class="vacio">Sin hábitos todavía.</li>';
    return;
  }

  datos.habitos.forEach(h => {
    const activo = marcados.includes(h.id);

    const li = document.createElement('li');
    li.className = 'item';

    const check = document.createElement('button');
    check.className = 'check';
    check.setAttribute('aria-pressed', activo);
    check.setAttribute('aria-label', h.nombre);
    check.onclick = () => alternar(h.id);

    const span = document.createElement('span');
    span.className = 'nombre';
    span.textContent = h.nombre;

    const del = document.createElement('button');
    del.className = 'borrar';
    del.textContent = '×';
    del.setAttribute('aria-label', 'Borrar ' + h.nombre);
    del.onclick = () => {
      if (confirm(`¿Borrar "${h.nombre}" y todo su histórico?`)) {
        borrarHabito(h.id);
      }
    };

    li.append(check, span, del);
    ul.appendChild(li);
  });
}

/* ---------- HEATMAP ---------- */

function nivel(fraccion) {
  if (fraccion <= 0) return '';
  if (fraccion < 0.34) return 'n1';
  if (fraccion < 0.67) return 'n2';
  if (fraccion < 1) return 'n3';
  return 'n4';
}

function renderHeatmap() {
  const cont = document.getElementById('heat');
  cont.innerHTML = '';

  const hoy = new Date();
  const inicio = new Date(hoy);
  inicio.setDate(hoy.getDate() - 25 * 7 - ((hoy.getDay() + 6) % 7));

  for (let i = 0; i < 182; i++) {
    const d = new Date(inicio);
    d.setDate(inicio.getDate() + i);
    const fecha = aISO(d);

    const total = datos.habitos.filter(h => h.creado <= fecha).length;
    const hechos = (datos.registro[fecha] || []).filter(id =>
      datos.habitos.some(h => h.id === id)
    ).length;

    const celda = document.createElement('div');
    const clase = total > 0 ? nivel(hechos / total) : '';
    if (clase) celda.classList.add(clase);

    const pct = total > 0 ? Math.round((hechos / total) * 100) : 0;
    celda.title = `${fecha} — ${hechos}/${total} (${pct}%)`;
    cont.appendChild(celda);
  }
}

/* ---------- RACHA ---------- */

function activosEn(fecha) {
  return datos.habitos.filter(h => h.creado <= fecha);
}

function diaCompleto(fecha) {
  const activos = activosEn(fecha);
  if (!activos.length) return false;
  const hechos = datos.registro[fecha] || [];
  return activos.every(h => hechos.includes(h.id));
}

function calcularRacha() {
  let actual = 0;
  const hoy = new Date();
  let i = diaCompleto(hoyISO()) ? 0 : 1;

  while (true) {
    const d = new Date(hoy);
    d.setDate(hoy.getDate() - i);
    if (!diaCompleto(aISO(d))) break;
    actual++;
    i++;
    if (i > 3650) break;
  }
  return actual;
}

function calcularRecord() {
  const fechas = Object.keys(datos.registro).sort();
  if (!fechas.length) return 0;

  let max = 0, run = 0;
  const d = new Date(fechas[0]);
  const fin = new Date(hoyISO());

  while (d <= fin) {
    if (diaCompleto(aISO(d))) {
      run++;
      if (run > max) max = run;
    } else {
      run = 0;
    }
    d.setDate(d.getDate() + 1);
  }
  return max;
}

function renderRacha() {
  const actual = calcularRacha();
  const record = Math.max(calcularRecord(), actual);
  document.getElementById('racha-num').textContent = actual;
  document.getElementById('racha-record').textContent = `Récord: ${record}`;
}

/* ---------- SEMANALES ---------- */

function diasSemana() {
  const hoy = new Date();
  const lunes = new Date(hoy);
  lunes.setDate(hoy.getDate() - ((hoy.getDay() + 6) % 7));

  const dias = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(lunes);
    d.setDate(lunes.getDate() + i);
    dias.push(aISO(d));
  }
  return dias;
}

function renderBarras() {
  const cont = document.getElementById('barras');
  cont.innerHTML = '';
  const semana = diasSemana();

  if (!datos.habitos.length) {
    cont.innerHTML = '<p class="vacio">Sin hábitos todavía.</p>';
    return;
  }

  datos.habitos.forEach(h => {
    const dias = semana.filter(f => h.creado <= f);
    const hechos = dias.filter(f => (datos.registro[f] || []).includes(h.id)).length;
    const pct = dias.length ? (hechos / dias.length) * 100 : 0;

    const grupo = document.createElement('div');
    grupo.className = 'barra-grupo';
    grupo.innerHTML = `
      <p class="barra-nombre"></p>
      <div class="barra-fila">
        <div class="barra"><div class="barra-fill" style="width:${pct}%"></div></div>
        <span class="barra-val">${hechos}/${dias.length}</span>
      </div>`;
    grupo.querySelector('.barra-nombre').textContent = h.nombre;
    cont.appendChild(grupo);
  });
}

function renderFooter() {
  const semana = diasSemana();
  let hechos = 0, posibles = 0;

  semana.forEach(f => {
    const activos = activosEn(f);
    posibles += activos.length;
    const marcados = datos.registro[f] || [];
    hechos += activos.filter(h => marcados.includes(h.id)).length;
  });

  const pct = posibles ? Math.round((hechos / posibles) * 100) : 0;
  const hora = new Date().toLocaleTimeString('es-ES', {
    hour: '2-digit', minute: '2-digit'
  });

  document.getElementById('footer').innerHTML =
    `<span>Actualizado ${hora}</span><span>${hechos}/${posibles} esta semana · ${pct}%</span>`;
}

/* ---------- CAMBIO DE DIA ---------- */

let diaCargado = hoyISO();

function comprobarDia() {
  if (hoyISO() !== diaCargado) {
    diaCargado = hoyISO();
    render();
  }
}

setInterval(comprobarDia, 60000);

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) comprobarDia();
});








//* ---------- EVENTOS E INICIO (exportado) ---------- */
export function iniciarHabitos(vista = 'constancia') {
  const input = document.getElementById('nuevo');

  // El input/botón "Añadir" están en vista-habitos (oculta, pero existen).
  // Guardamos por si acaso no estuvieran.
  if (input) {
    document.getElementById('add').onclick = () => {
      crearHabito(input.value);
      input.value = '';
    };
    input.onkeydown = e => {
      if (e.key === 'Enter') {
        crearHabito(input.value);
        input.value = '';
      }
    };
  }

  document.querySelectorAll('.nav-btn').forEach(b => {
    b.onclick = () => cambiarVista(b.dataset.vista);
  });

  cambiarVista(vista);   // arranca directamente en la vista que le pases
}
