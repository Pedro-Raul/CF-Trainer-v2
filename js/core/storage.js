const SESSION_KEY = "cf-session";
const USERS_KEY = "cf_users";
const SUBS_KEY = "cf_submissions";
const FRIENDS_KEY  = "cf_friends";
const TOURNAMENTS_KEY = 'cf_tournaments';

// sesión
export function saveSession(user) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(user));
}

export function loadSession() {
  return JSON.parse(localStorage.getItem(SESSION_KEY));
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

// Usuario
export function saveUsers(users) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

export function loadUsers() {
  return JSON.parse(localStorage.getItem(USERS_KEY)) || [];
}

// Submissions
export function saveSubmissions(subs) {
  localStorage.setItem(SUBS_KEY, JSON.stringify(subs));
}

export function loadSubmissions() {
  return JSON.parse(localStorage.getItem(SUBS_KEY)) || {};
}

// Amigos
export function saveFriends(friends) {
    localStorage.setItem(FRIENDS_KEY, JSON.stringify(friends)); 
}

export function loadFriends(){
  return JSON.parse(localStorage.getItem(FRIENDS_KEY)) || []; 
}

export function saveTournaments(t) { 
  localStorage.setItem(TOURNAMENTS_KEY, JSON.stringify(t)); 
}
export function loadTournaments()  { 
  return JSON.parse(localStorage.getItem(TOURNAMENTS_KEY)) || []; 
}