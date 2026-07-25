// Imporar función
import { iniciarHabitos } from './habit-tracker/script.js';

// html habit tracker
fetch('habit-tracker/index.html')
  .then(respuesta => respuesta.text())
  .then(html => {
    // convertir en texto
    const parser = new DOMParser();
    const docVirtual = parser.parseFromString(html, 'text/html');

    const appFrame = docVirtual.querySelector('.frame');
    const appNav = docVirtual.querySelector('.nav');

    const contenedor = document.getElementById('contenedor-tracker');
    if (appFrame && appNav) {
        contenedor.appendChild(appFrame);
        contenedor.appendChild(appNav);

        iniciarHabitos('constancia');
    }
  })
  .catch(error => console.error("Error al cargar el Habit Tracker:", error));
