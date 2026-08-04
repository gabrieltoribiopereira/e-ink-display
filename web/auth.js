// Login contra Supabase. El registro esta cerrado: el usuario se crea a mano
// desde el panel de Supabase, aqui solo se inicia sesion.

const login = document.getElementById("login");
const dashboard = document.getElementById("dashboard");
const errorBox = document.getElementById("login-error");

// Ambos divs arrancan con [hidden] para que no haya parpadeo ni se vea el
// dashboard antes de saber si hay sesion. data-auth le dice al navegador del
// server (Playwright) que la comprobacion ya termino y que puede mirar.
let habiaSesion = false;

function mostrarSesion(session) {
  dashboard.hidden = !session;
  login.hidden = !!session;
  document.body.dataset.auth = session ? "in" : "out";

  // Los scripts arrancan con la pagina, antes de que Supabase restaure la
  // sesion, asi que sus primeras peticiones salen sin usuario y vuelven vacias.
  // Este aviso les dice cuando pueden volver a pedir los datos de verdad.
  // onAuthStateChange se dispara varias veces, de ahi el control de transicion.
  if (session && !habiaSesion) window.dispatchEvent(new Event("sesion-lista"));
  if (!session && habiaSesion) olvidarAjustes();   // que otra cuenta no herede los mios
  habiaSesion = !!session;
}

if (typeof CONFIG === "undefined" || !CONFIG.SUPABASE_URL || !CONFIG.SUPABASE_ANON_KEY) {
  // Sin config no se puede autenticar: se muestra el login con el error en vez
  // de dejar el dashboard accesible.
  mostrarSesion(null);
  errorBox.textContent = "Falta config.js con SUPABASE_URL y SUPABASE_ANON_KEY";
  throw new Error("auth.js: CONFIG incompleto");
}

const { createClient } = supabase;
const db = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);

// El habit-tracker es un modulo aparte y necesita este mismo cliente para
// guardar en Supabase. Se expone en window porque un `const` de un script
// clasico no es accesible por nombre desde un modulo.
window.db = db;

// Estado inicial: sin esto la pagina se queda en blanco hasta que llegue el
// primer onAuthStateChange.
db.auth.getSession().then(({ data }) => mostrarSesion(data.session));

db.auth.onAuthStateChange((_evento, session) => mostrarSesion(session));

document.getElementById("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = document.getElementById("btn-login");
  errorBox.textContent = "";
  btn.disabled = true;
  const { error } = await db.auth.signInWithPassword({
    email: document.getElementById("email").value,
    password: document.getElementById("password").value,
  });
  if (error) errorBox.textContent = error.message;
  btn.disabled = false;
});

document.getElementById("btn-logout").addEventListener("click", () => {
  db.auth.signOut();
});
