import { initRouter } from './core/router.js';
import { state } from './core/state.js';
import { addUser } from './services/users.js';
import { navigate } from './core/router.js';
import { loadSession, loadUsers, loadSubmissions, loadFriends, saveUsers, clearSession } from './core/storage.js';
import { getProblemset } from './services/codeforces.js';
import { login } from './services/auth.js';
import { loadTournaments } from './core/storage.js';
import { importTournament, decodeTournamentFromURL } from './services/tournament.js';

async function initApp() {
  console.log("App iniciada");

  state.users       = loadUsers();
  state.submissions = loadSubmissions();
  state.friends     = loadFriends();
  state.tournaments = loadTournaments();

  try {
    state.problems = (await getProblemset()).slice(0, 3000);
  } catch (err) {
    console.warn('No se pudo cargar problemset de Codeforces:', err);
    state.problems = [];
  }

  const session = loadSession();
  initRouter();

  if (session) {
    state.currentUser = {
      ...session,
      handle: session.handle?.toLowerCase?.() || session.handle
    };

    if (!state.submissions[state.currentUser.handle]) {
      const { getCFSubmissions } = await import('./services/codeforces.js');
      const { saveSubmissions }  = await import('./core/storage.js');
      const subs = await getCFSubmissions(state.currentUser.handle);
      state.submissions[state.currentUser.handle] = subs;
      saveSubmissions(state.submissions);
    }
    navigate('overview');
  } else {
    navigate('login');
  }
}


window.addUserFromUI = async function () {
  const input = document.getElementById('userInput');
  if (!input) return;
  const handle = input.value.trim();
  if (!handle) return;
  try {
    await addUser(handle);
    input.value = '';
    navigate('overview');
  } catch (err) {
    alert("Usuario no encontrado");
  }
};

window.clearAllUsers = function () {
  state.users = [];
  saveUsers(state.users);
  navigate('overview');
};

window.loginFromUI = async function () {
  const name   = document.getElementById('nameInput').value.trim();
  const handle = document.getElementById('handleInput').value.trim();
  if (!name || !handle) return;
  try {
    await login(name, handle);
    navigate('overview');
  } catch (err) {
    alert("Handle inválido");
  }
};

window.logout = function () {
  clearSession();
  state.currentUser = null;
  state.users       = [];
  state.submissions = {};
  state.problems    = [];
  state.friends     = [];
  navigate('login');
};

document.addEventListener('DOMContentLoaded', initApp);