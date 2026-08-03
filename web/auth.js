// Login contra Supabase. El registro esta cerrado: el usuario se crea a mano
// desde el panel de Supabase, aqui solo se inicia sesion.

const login = document.getElementById("login");
const dashboard = document.getElementById("dashboard");
const errorBox = document.getElementById("login-error");

// Ambos divs arrancan con [hidden] para que no haya parpadeo ni se vea el
// dashboard antes de saber si hay sesion. data-auth le dice al navegador del
// server (Playwright) que la comprobacion ya termino y que puede mirar.
function mostrarSesion(session) {
  dashboard.hidden = !session;
  login.hidden = !!session;
  document.body.dataset.auth = session ? "in" : "out";
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
