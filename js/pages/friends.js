import { state } from '../core/state.js';
import { addFriend, removeFriend } from '../services/friends.js';

export function loadFriends() {
  const page = document.querySelector('.page[data-page="friends"]');

  page.innerHTML = `
  <div class="page-header">
    <div class="page-title">Amigos</div>
    <div class="page-sub">Gestiona tu lista</div>
  </div>

  <div class="card">
    <h2>Agregar amigo</h2>
    <div class="friend-add-row">
      <input id="friendInput" type="text" placeholder="Handle de Codeforces">
      <button id="friendAddBtn" onclick="addFriendFromUI()">+ Agregar</button>
    </div>
    <div id="friendMsg"></div>
  </div>

  <div class="card">
    <h2>Mis amigos</h2>
    <div id="friendsList"></div>
  </div>
`;

  renderFriendsList();
}

function renderFriendsList() {
  const container = document.getElementById('friendsList');
  if (!container) return;

  const friends = state.friends;

  if (!friends.length) {
    container.innerHTML = `<p class="empty-msg">Aún no tienes amigos agregados</p>`;
    return;
  }

  const sorted = [...friends].sort((a, b) => b.rating - a.rating);

  container.innerHTML = sorted.map((f, i) => `
    <div class="friend-row">
      <img class="friend-avatar" src="${f.avatar}" alt="${f.handle}">
      <div class="friend-info">
        <span class="friend-handle">${f.handle}</span>
        <span class="friend-meta">${f.rank} · <strong>${f.rating}</strong></span>
      </div>
      <button class="btn-remove" onclick="removeFriendFromUI('${f.handle}')">Eliminar</button>
    </div>
  `).join('');
}

// funciones globales para los onclick del HTML
window.addFriendFromUI = async function () {
  const input = document.getElementById('friendInput');
  const msg   = document.getElementById('friendMsg');
  const btn   = document.getElementById('friendAddBtn');
  const handle = input.value.trim();

  if (!handle) return;

  btn.disabled = true;
  btn.textContent = 'Buscando...';
  msg.innerHTML = '';

  try {
    await addFriend(handle);
    input.value = '';
    msg.innerHTML = `<span class="msg-ok">✓ ${handle} agregado</span>`;
    renderFriendsList();
  } catch (err) {
    msg.innerHTML = `<span class="msg-err">✗ ${err.message}</span>`;
  } finally {
    btn.disabled = false;
    btn.textContent = '+ Agregar';
  }
};

window.removeFriendFromUI = function (handle) {
  removeFriend(handle);
  renderFriendsList();
};