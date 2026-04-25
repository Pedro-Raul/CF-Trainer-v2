import { initRouter } from './core/router.js';
import { state } from './core/state.js';
import { addUser } from './services/users.js';
import { navigate } from './core/router.js';
import {
  loadSession,
  loadUsers,
  loadSubmissions,
  loadFriends,
  saveUsers,
  saveSubmissions,
  saveFriends,
  saveSession,
  clearSession
} from './core/storage.js';
import { getProblemset } from './services/codeforces.js';
import { login } from './services/auth.js';
import { loadTournaments } from './core/storage.js';
import { importTournament, decodeTournamentFromURL, normalizeTournamentShape } from './services/tournament.js';

async function initApp() {
  console.log("App iniciada");

  const rawUsers = loadUsers();
  const rawSubs = loadSubmissions();
  const rawFriends = loadFriends();

  state.users       = normalizeHandleArray(rawUsers);
  state.submissions = normalizeSubmissionsMap(rawSubs);
  state.friends     = normalizeHandleArray(rawFriends);
  state.tournaments = loadTournaments().map(normalizeTournamentShape);

  if (JSON.stringify(rawUsers) !== JSON.stringify(state.users)) {
    saveUsers(state.users);
  }
  if (JSON.stringify(rawSubs) !== JSON.stringify(state.submissions)) {
    saveSubmissions(state.submissions);
  }
  if (JSON.stringify(rawFriends) !== JSON.stringify(state.friends)) {
    saveFriends(state.friends);
  }

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
    saveSession(state.currentUser);

    if (!state.submissions[state.currentUser.handle]) {
      const { getCFSubmissions } = await import('./services/codeforces.js');
      const subs = await getCFSubmissions(state.currentUser.handle);
      state.submissions[state.currentUser.handle] = subs;
      saveSubmissions(state.submissions);
    }

    // Rehidratar submissions faltantes de amigos ya guardados
    await hydrateMissingFriendSubmissions();
    navigate('overview');
  } else {
    navigate('login');
  }

  // Procesar ?t= en la URL (torneo compartido por link)
  const urlParams = new URLSearchParams(location.search);
  const tParam    = urlParams.get('t');

  if (tParam && state.currentUser) {
    try {
      const data = decodeTournamentFromURL(tParam);
      if (data) importTournament(data);
    } catch (e) {
      console.warn('Error importando torneo desde URL:', e);
    }
    history.replaceState({}, '', location.pathname);
    navigate('torneo');
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
  // Mantener caches en memoria para evitar estado inconsistente al relogin.
  navigate('login');
};

document.addEventListener('DOMContentLoaded', initApp);

function normalizeHandleArray(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.map(item => {
    if (!item?.handle) return item;
    return { ...item, handle: item.handle.toLowerCase() };
  });
}

function normalizeSubmissionsMap(submissionsMap) {
  if (!submissionsMap || typeof submissionsMap !== 'object') return {};

  const normalized = {};
  for (const [rawHandle, rawSubs] of Object.entries(submissionsMap)) {
    const handle = rawHandle.toLowerCase();
    const subs = Array.isArray(rawSubs) ? rawSubs : [];

    if (!normalized[handle]) {
      normalized[handle] = [...subs];
      continue;
    }

    const seen = new Set(normalized[handle].map(s => String(s?.id ?? `${s?.creationTimeSeconds}-${s?.problem?.contestId}-${s?.problem?.index}`)));
    for (const sub of subs) {
      const key = String(sub?.id ?? `${sub?.creationTimeSeconds}-${sub?.problem?.contestId}-${sub?.problem?.index}`);
      if (!seen.has(key)) {
        seen.add(key);
        normalized[handle].push(sub);
      }
    }
  }

  return normalized;
}

async function hydrateMissingFriendSubmissions() {
  if (!state.friends?.length) return;

  const { getCFSubmissions } = await import('./services/codeforces.js');
  let didChange = false;

  for (const friend of state.friends) {
    const handle = friend?.handle?.toLowerCase?.();
    if (!handle) continue;
    if (state.submissions[handle]) continue;

    try {
      const subs = await getCFSubmissions(handle);
      state.submissions[handle] = subs;
      didChange = true;
    } catch (err) {
      console.warn(`No se pudieron cargar submissions de ${handle}:`, err);
    }
  }

  if (didChange) saveSubmissions(state.submissions);
}
