import { iniciarHabitos } from '/habit-tracker/script.js';
async function cargarHabitos() {
  const res = await fetch('/habit-tracker/index.html')
  const html = await res.text()
  const doc = new DOMParser().parseFromString(html, 'text/html')

  const contenido = doc.querySelector('.frame')
  contenido.querySelector('#vista-habitos').hidden = true;
  contenido.querySelector("#vista-constancia").hidden = false;

  document.querySelector('#pantalla-habitos').appendChild(contenido)
  iniciarHabitos()
}
cargarHabitos()
