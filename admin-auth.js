const SUPABASE_URL = "https://fafryvpzvewbwjgznzsg.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_l4iQHwmQpCOPnoe7JBcK4w_soduEaIy";
const ADMIN_UID = "d388d8a5-e1a5-44ce-a498-5fe297019d7e";

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
);

const loginScreen = document.getElementById("loginScreen");
const adminPanel = document.getElementById("adminPanel");
const loginForm = document.getElementById("loginForm");
const loginEmail = document.getElementById("loginEmail");
const loginPassword = document.getElementById("loginPassword");
const loginButton = document.getElementById("loginButton");
const loginMessage = document.getElementById("loginMessage");
const adminUser = document.getElementById("adminUser");
const logoutButton = document.getElementById("logoutButton");

function showLoginMessage(message, type = "error") {
  loginMessage.style.display = "block";
  loginMessage.className = type === "success" ? "auth-success" : "auth-error";
  loginMessage.textContent = message;
}

function showPanel(user) {
  loginScreen.style.display = "none";
  adminPanel.style.display = "block";
  adminUser.textContent = user?.email || "";
}

function showLogin() {
  loginScreen.style.display = "grid";
  adminPanel.style.display = "none";
  adminUser.textContent = "";
}

async function checkSession() {
  const { data, error } = await supabaseClient.auth.getSession();

  if (error || !data.session) {
    showLogin();
    return;
  }

  const user = data.session.user;

  if (user.id !== ADMIN_UID) {
    await supabaseClient.auth.signOut();
    showLoginMessage("Esta cuenta no tiene permisos de administrador.");
    return;
  }

  showPanel(user);
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  loginButton.disabled = true;
  loginButton.textContent = "Entrando...";
  loginMessage.style.display = "none";

  const email = loginEmail.value.trim();
  const password = loginPassword.value;

  const { data, error } = await supabaseClient.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    showLoginMessage("Correo o contraseña incorrectos.");
    loginButton.disabled = false;
    loginButton.textContent = "🔐 Iniciar sesión";
    return;
  }

  if (!data.user || data.user.id !== ADMIN_UID) {
    await supabaseClient.auth.signOut();
    showLoginMessage("Esta cuenta no tiene permisos de administrador.");
    loginButton.disabled = false;
    loginButton.textContent = "🔐 Iniciar sesión";
    return;
  }

  showPanel(data.user);

  loginButton.disabled = false;
  loginButton.textContent = "🔐 Iniciar sesión";
});

logoutButton.addEventListener("click", async () => {
  await supabaseClient.auth.signOut();
  showLogin();
  loginPassword.value = "";
  showLoginMessage("Sesión cerrada.", "success");
});

supabaseClient.auth.onAuthStateChange((_event, session) => {
  if (!session) {
    showLogin();
  }
});

checkSession();
