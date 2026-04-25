import { state } from '../core/state.js';
import {
  createTournament,
  importTournament,
  deleteTournament,
  getLeaderboard,
  pickProblems,
  getTournamentShareLink,
  decodeTournamentFromURL,
  verifySolutions,
  syncTournamentParticipants,
  hydrateTournamentParticipants
} from '../services/tournament.js';

const CF_TAGS = [
  'dp','greedy','graphs','math','implementation','binary search',
  'sorting','brute force','dfs and similar','trees','strings',
  'number theory','geometry','combinatorics','two pointers',
  'data structures','bitmasks','constructive algorithms','flows','games'
];

// Estado local del modal
let _modal = {
  participants: [],   // handles extra seleccionados
  customInput: ''
};
const _autoSyncingTournamentIds = new Set();

// ── Entry point ────────────────────────────────────────────

export function loadTorneo() {
  const page = document.querySelector('.page[data-page="torneo"]');
  if (!page) return;
  renderPage(page);
  hydrateVisibleTournaments();
}

// ── Render principal ───────────────────────────────────────

function renderPage(page) {
  const user = state.currentUser;

  if (!page.querySelector('.tn-topbar')) {
    page.innerHTML = `
      <div class="page-header">
        <div class="page-title">Torneos</div>
        <div class="page-sub">Compite contra tus amigos con flujo tipo VJudge: crea, comparte y sincroniza.</div>
      </div>

      <div class="tn-hub">
        <div class="tn-topbar">
          <button class="tn-create-btn" onclick="showCreateModal()">
            <span>＋</span> Nuevo torneo
          </button>
          <div class="tn-import-wrap">
            <input id="tnImportInput" type="text"
                   placeholder="Pega el link de invitación (https://...)"
                   onkeydown="if(event.key==='Enter')joinTournamentFromUI()">
            <button class="secondary" onclick="joinTournamentFromUI()">Unirme</button>
          </div>
        </div>
        <div class="tn-hub-guide">
          <div class="tn-guide-title">Flujo rápido</div>
          <div class="tn-guide-steps">
            <span><strong>1.</strong> Crea torneo</span>
            <span><strong>2.</strong> Comparte link</span>
            <span><strong>3.</strong> Sincroniza resultados</span>
          </div>
        </div>
      </div>
      <div id="tnMsg" class="tn-msg"></div>

      <div class="tn-section">
        <div class="tn-section-title">Mis torneos <span id="tnMineCount" class="tn-count-pill">0</span></div>
        <div id="tnMine"></div>
      </div>
      <div class="tn-section">
        <div class="tn-section-title">Torneos donde participo <span id="tnJoinedCount" class="tn-count-pill">0</span></div>
        <div id="tnJoined"></div>
      </div>
    `;
  }

  const mine   = state.tournaments.filter(t =>
    t.creator.toLowerCase() === user.handle.toLowerCase()
  );
  const joined = state.tournaments.filter(t =>
    t.creator.toLowerCase() !== user.handle.toLowerCase() &&
    t.participants.some(p => p.handle.toLowerCase() === user.handle.toLowerCase())
  );
  const mineCountEl = page.querySelector('#tnMineCount');
  const joinedCountEl = page.querySelector('#tnJoinedCount');
  if (mineCountEl) mineCountEl.textContent = String(mine.length);
  if (joinedCountEl) joinedCountEl.textContent = String(joined.length);

  page.querySelector('#tnMine').innerHTML = mine.length
    ? mine.map(t => renderCard(t)).join('')
    : '<p class="empty-msg">No has creado torneos aún</p>';

  page.querySelector('#tnJoined').innerHTML = joined.length
    ? joined.map(t => renderCard(t)).join('')
    : '<p class="empty-msg">Aún no participas en torneos de otros</p>';

  ensureModal();
  bindGlobals();
}

// ── Modal de creación ──────────────────────────────────────

function ensureModal() {
  if (document.getElementById('tnModal')) return;
  const el = document.createElement('div');
  el.className = 'modal-backdrop';
  el.id = 'tnModal';
  el.style.display = 'none';
  el.innerHTML = `
    <div class="modal tn-modal">
      <div class="modal-header">
        <span class="modal-title">Nuevo torneo</span>
        <button class="secondary" onclick="hideCreateModal()">✕</button>
      </div>

      <!-- Nombre -->
      <label>Nombre del torneo</label>
      <input id="tnName" type="text" placeholder="ej. Battle of the Nerds">

      <!-- Problemas y rating en fila -->
      <div class="tn-modal-row">
        <div class="tn-modal-col">
          <label>Problemas</label>
          <div class="range-row">
            <input type="range" id="tnCount" min="1" max="10" value="5"
                   oninput="document.getElementById('tnCountVal').textContent=this.value">
            <span id="tnCountVal" class="range-val">5</span>
          </div>
        </div>
        <div class="tn-modal-col">
          <label>Rating</label>
          <div class="rating-range-row">
            <input id="tnRMin" type="text" value="800"  placeholder="Min">
            <span style="color:var(--muted);flex-shrink:0">—</span>
            <input id="tnRMax" type="text" value="1600" placeholder="Max">
          </div>
        </div>
      </div>

      <label>Ejercicios específicos <span class="field-hint" style="text-transform:none;letter-spacing:0">(links de CF o formato 1234-A)</span></label>
      <textarea id="tnForcedProblems" rows="2" placeholder="https://codeforces.com/problemset/problem/4/A&#10;1900-B"></textarea>

      <div class="tn-modal-row tn-modal-row-compact">
        <div class="tn-modal-col">
          <label>Mín. resueltos globales</label>
          <input id="tnMinSolvedCount" type="text" value="0" placeholder="ej. 5000">
        </div>
        <div class="tn-modal-col">
          <label>Divisiones CF</label>
          <div class="tn-div-picker" id="tnDivPicker">
            ${[1,2,3,4].map(div => `
              <button type="button" class="tn-div-option" data-div="${div}" onclick="toggleDivision(this)">Div ${div}</button>
            `).join('')}
          </div>
        </div>
      </div>

      <!-- Tags -->
      <label>Categorías <span class="field-hint" style="text-transform:none;letter-spacing:0">(opcional)</span></label>
      <div class="tags-picker" id="tnTagsPicker">
        ${CF_TAGS.map(tag =>
          `<div class="tag-option" data-tag="${tag}" onclick="toggleTag(this)">${tag}</div>`
        ).join('')}
      </div>

      <!-- Participantes -->
      <label>Participantes</label>
      <div class="tn-participants-section">

        <!-- Amigos como checklist -->
        ${state.friends.length ? `
        <div class="tn-friends-check" id="tnFriendsCheck">
          ${state.friends.map(f => `
            <label class="tn-friend-check-item" id="fcheck-${f.handle}">
              <input type="checkbox" value="${f.handle}"
                     onchange="toggleFriendParticipant(this)">
              <img src="${f.avatar}" class="tn-fc-avatar">
              <div class="tn-fc-info">
                <span class="tn-fc-handle">${f.handle}</span>
                <span class="tn-fc-rating">${f.rating || '—'}</span>
              </div>
              <span class="tn-fc-check-icon">✓</span>
            </label>`).join('')}
        </div>` : ''}

        <!-- Input manual para handles externos -->
        <div class="tn-manual-add">
          <input id="tnHandleInput" type="text"
                 placeholder="Agregar handle externo…"
                 style="margin-bottom:0"
                 onkeydown="if(event.key==='Enter'){event.preventDefault();addManualParticipant();}">
          <button class="secondary" onclick="addManualParticipant()">+ Agregar</button>
        </div>

        <!-- Chips de todos los seleccionados -->
        <div id="tnParticipantChips" class="tn-chips"></div>
      </div>

      <div id="tnModalErr" class="tn-modal-err"></div>

      <div class="modal-actions">
        <button class="secondary" onclick="hideCreateModal()">Cancelar</button>
        <button id="tnCreateBtn" onclick="createTournamentFromUI()">Crear torneo →</button>
      </div>
    </div>
  `;
  document.body.appendChild(el);
}

function refreshChips() {
  const el = document.getElementById('tnParticipantChips');
  if (!el) return;
  const user = state.currentUser;

  const all = [
    { handle: user.handle, isCreator: true },
    ..._modal.participants.map(h => ({ handle: h, isCreator: false }))
  ];

  el.innerHTML = all.map(({ handle, isCreator }) => `
    <div class="tn-chip ${isCreator ? 'tn-chip-creator' : ''}">
      ${handle}
      ${isCreator
        ? '<span class="tn-chip-you">tú</span>'
        : `<button class="tn-chip-rm" onclick="removeModalParticipant('${handle}')">✕</button>`}
    </div>
  `).join('');
}

// ── Render de tarjeta de torneo ────────────────────────────

function renderCard(t) {
  const user      = state.currentUser;
  const lb        = getLeaderboard(t);
  const isCreator = t.creator.toLowerCase() === user.handle.toLowerCase();
  const me        = lb.find(p => p.handle.toLowerCase() === user.handle.toLowerCase());
  const myPos     = lb.findIndex(p => p.handle.toLowerCase() === user.handle.toLowerCase()) + 1;
  const total     = t.problems.length;
  const mySolved  = me ? Object.keys(me.solvedAt).length : 0;
  const pct       = total ? Math.round((mySolved / total) * 100) : 0;
  const updated   = t.lastUpdated ? timeAgo(t.lastUpdated) : 'nunca';
  const globalSync = t.lastGlobalSyncAt ? ` · global: ${timeAgo(t.lastGlobalSyncAt)}` : '';
  const syncLabel = t.lastGlobalSyncAt
    ? `Datos sincronizados desde Codeforces · última actualización ${timeAgo(t.lastGlobalSyncAt)}`
    : 'Datos pendientes de sincronización desde Codeforces';
  const progressTone = pct >= 80 ? 'tn-kpi-good' : pct >= 40 ? 'tn-kpi-mid' : 'tn-kpi-low';

  return `
  <div class="tn-card" id="tnc-${t.id}">

    <!-- Header -->
    <div class="tn-card-head">
      <div class="tn-card-info">
        <div class="tn-card-name">${t.name}</div>
        <div class="tn-card-meta">
          ${total} problema${total !== 1 ? 's' : ''} ·
          ${t.participants.length} participante${t.participants.length !== 1 ? 's' : ''} ·
          creado por <strong>${t.creator}</strong>
        </div>
      </div>
      <div class="tn-card-actions">
        <button class="secondary tn-share-btn" onclick="copyShareLink(${t.id})" title="Copiar link de invitación">
          ⇪ Compartir
        </button>
        ${isCreator
          ? `<button class="danger" onclick="deleteTournamentUI(${t.id})">✕</button>`
          : ''}
      </div>
    </div>

    <div class="tn-kpis">
      <span class="tn-kpi ${progressTone}">Progreso: ${mySolved}/${total}</span>
      <span class="tn-kpi">Puesto: #${myPos}</span>
      <span class="tn-kpi">Participantes: ${t.participants.length}</span>
    </div>

    <!-- Mi progreso -->
    <div class="tn-my-progress">
      <div class="tn-progress-label">
        <span>Mi progreso</span>
        <span class="tn-progress-num">${mySolved}/${total} · puesto #${myPos}</span>
      </div>
      <div class="tn-progress-bar">
        <div class="tn-progress-fill" style="width:${pct}%"></div>
      </div>
    </div>

    <!-- Botón verificar -->
    <div class="tn-verify-row">
      <button class="tn-verify-btn secondary" id="tnVBtn-${t.id}" onclick="verifyUI(${t.id})">
        ↻ Verificar mis envíos
      </button>
      <button class="tn-verify-btn secondary" id="tnSyncAll-${t.id}" onclick="syncAllParticipantsUI(${t.id})">
        ↻ Sincronizar todos
      </button>
      <span class="tn-verify-hint" id="tnVHint-${t.id}">Actualizado: ${updated}${globalSync}</span>
    </div>
    <div class="tn-sync-banner">${syncLabel}</div>

    <!-- Grid de participantes -->
    <div class="tn-block-title">Participantes</div>
    <div class="tn-pgrid" id="tnPgrid-${t.id}">
      ${renderParticipantGrid(t, lb)}
    </div>

    <!-- Problemas -->
    <div class="tn-problems-header">
      <span>Problemas</span>
    </div>
    <div class="tn-problems">
      ${t.problems.map(p => {
        const key      = `${p.contestId}-${p.index}`;
        const isSolved = !!me?.solvedAt[key];
        const solvedBy = lb.filter(u => u.solvedAt[key]).length;
        const timeTaken = isSolved ? me.solvedAt[key] - t.createdAt : null;
        return `
          <a class="tn-problem ${isSolved ? 'tn-solved' : ''}"
             href="https://codeforces.com/problemset/problem/${p.contestId}/${p.index}"
             target="_blank">
            <span class="tn-p-check">${isSolved ? '✓' : '○'}</span>
            <div class="tn-p-body">
              <div class="tn-p-name">${p.name}</div>
              <div class="tn-p-tags">
                <span class="pill ${ratingPill(p.rating)}">${p.rating || '?'}</span>
                ${(p.tags || []).slice(0, 2).map(tag =>
                  `<span class="tn-p-tag">${tag}</span>`
                ).join('')}
              </div>
            </div>
            <div class="tn-p-right">
              ${isSolved
                ? `<span class="tn-p-time">+${formatMs(timeTaken)}</span>`
                : `<span class="tn-p-solvers">${solvedBy}/${t.participants.length}</span>`}
              ${renderProblemSubmitSplit(t, key, user.handle)}
            </div>
          </a>`;
      }).join('')}
    </div>

    <!-- Leaderboard -->
    <div class="tn-lb">
      <div class="tn-block-title">Clasificación</div>
      ${lb.map((u, i) => {
        const isMe = u.handle.toLowerCase() === user.handle.toLowerCase();
        const isFriend = state.friends.some(f => f.handle.toLowerCase() === u.handle.toLowerCase());
        const roleLabel = isMe ? 'Tú' : isFriend ? 'Amigo' : 'Externo';
        const roleClass = isMe ? 'tn-role-pill-me' : isFriend ? 'tn-role-pill-friend' : 'tn-role-pill-external';
        return `
        <div class="tn-lb-row ${isMe ? 'tn-lb-me' : ''}">
          <span class="lb-pos ${i===0?'gold':i===1?'silver':i===2?'bronze':''}">${i+1}</span>
          <span class="tn-lb-avatar ${isMe ? 'tn-lb-avatar-me' : ''}">${getHandleInitial(u.handle)}</span>
          <span class="tn-lb-handle">${u.handle}</span>
          <span class="tn-role-pill ${roleClass}">${roleLabel}</span>
          <div class="tn-lb-bar-wrap">
            <div class="tn-lb-bar" style="width:${total ? Math.round((u.count/total)*100) : 0}%"></div>
          </div>
          <span class="pill blue">${u.count}/${total}</span>
          <span class="tn-p-time">${u.totalMs > 0 ? formatMs(u.totalMs) : '—'}</span>
        </div>`;
      }).join('')}
    </div>
  </div>`;
}

function renderParticipantGrid(t, lb) {
  const total = t.problems.length;
  if (!lb.length) return '<p class="empty-msg" style="padding:8px 0;font-size:10px;">Sin datos — presiona Actualizar mi progreso</p>';

  const user = state.currentUser;
  const friendHandles = new Set((state.friends || []).map(f => f.handle.toLowerCase()));
  return lb.map(u => {
    const isMe = u.handle.toLowerCase() === user.handle.toLowerCase();
    const pct  = total ? Math.round((u.count / total) * 100) : 0;
    const p = t.participants.find(item => item.handle.toLowerCase() === u.handle.toLowerCase());
    const role = isMe ? 'Tú' : friendHandles.has(u.handle.toLowerCase()) ? 'Amigo' : 'Externo';
    return `
      <div class="tn-pg-item ${isMe ? 'tn-pg-me' : ''}">
        <div class="tn-pg-head">
          <span class="tn-pg-avatar ${isMe ? 'tn-pg-avatar-me' : ''}">${getHandleInitial(u.handle)}</span>
          <div class="tn-pg-head-text">
            <div class="tn-pg-handle">${u.handle}</div>
            <div class="tn-pg-role">${role} · ${p?.lastSyncedAt ? `sync ${timeAgo(p.lastSyncedAt)}` : 'sin sync'}</div>
          </div>
        </div>
        <div class="tn-pg-bar-wrap">
          <div class="tn-pg-bar" style="width:${pct}%"></div>
        </div>
        <div class="tn-pg-pct">${u.count}/${total}</div>
      </div>`;
  }).join('');
}

// ── Globals ────────────────────────────────────────────────

function bindGlobals() {
  const user = state.currentUser;

  window.showCreateModal = () => {
    _modal.participants = [];
    // Desmarcar todos los checkboxes
    document.querySelectorAll('#tnFriendsCheck input[type=checkbox]')
      .forEach(cb => { cb.checked = false; });
    document.querySelectorAll('.tn-friend-check-item')
      .forEach(el => el.classList.remove('checked'));
    refreshChips();
    document.getElementById('tnName').value = '';
    document.getElementById('tnForcedProblems').value = '';
    document.getElementById('tnMinSolvedCount').value = '0';
    document.querySelectorAll('#tnDivPicker .tn-div-option')
      .forEach(btn => btn.classList.remove('selected'));
    document.getElementById('tnModalErr').innerHTML = '';
    document.getElementById('tnModal').style.display = 'flex';
    setTimeout(() => document.getElementById('tnName')?.focus(), 50);
  };

  window.hideCreateModal = () => {
    document.getElementById('tnModal').style.display = 'none';
  };

  window.toggleTag = el => el.classList.toggle('selected');
  window.toggleDivision = el => el.classList.toggle('selected');

  window.toggleFriendParticipant = (cb) => {
    const handle = cb.value;
    const label  = cb.closest('.tn-friend-check-item');
    if (cb.checked) {
      if (!_modal.participants.includes(handle)) _modal.participants.push(handle);
      label?.classList.add('checked');
    } else {
      _modal.participants = _modal.participants.filter(h => h !== handle);
      label?.classList.remove('checked');
    }
    refreshChips();
  };

  window.addManualParticipant = () => {
    const inp    = document.getElementById('tnHandleInput');
    const handle = inp.value.trim();
    const errEl  = document.getElementById('tnModalErr');
    if (!handle) return;

    const hl = handle.toLowerCase();
    if (hl === user.handle.toLowerCase()) { inp.value = ''; return; }
    if (_modal.participants.some(h => h.toLowerCase() === hl)) {
      errEl.innerHTML = `<span class="msg-err">Ya está en la lista</span>`;
      setTimeout(() => errEl.innerHTML = '', 2000);
      inp.value = '';
      return;
    }
    _modal.participants.push(handle);
    refreshChips();
    errEl.innerHTML = '';
    inp.value = '';
    inp.focus();
  };

  window.removeModalParticipant = (handle) => {
    _modal.participants = _modal.participants.filter(h => h !== handle);
    // Desmarcar checkbox si existe
    const cb = document.querySelector(`#tnFriendsCheck input[value="${handle}"]`);
    if (cb) {
      cb.checked = false;
      cb.closest('.tn-friend-check-item')?.classList.remove('checked');
    }
    refreshChips();
  };

  // ── Crear torneo ─────────────────────────────────────────
  window.createTournamentFromUI = () => {
    const btn   = document.getElementById('tnCreateBtn');
    const errEl = document.getElementById('tnModalErr');

    const name      = document.getElementById('tnName').value.trim();
    const count     = Number(document.getElementById('tnCount').value);
    const ratingMin = Number(document.getElementById('tnRMin').value) || 800;
    const ratingMax = Number(document.getElementById('tnRMax').value) || 3500;
    const minSolvedCount = Math.max(0, Number(document.getElementById('tnMinSolvedCount').value) || 0);
    const forcedProblemRefs = document.getElementById('tnForcedProblems').value
      .split(/\n|,|;/)
      .map(item => item.trim())
      .filter(Boolean);
    const tags      = [...document.querySelectorAll('#tnTagsPicker .tag-option.selected')]
                        .map(el => el.dataset.tag);
    const divisions = [...document.querySelectorAll('#tnDivPicker .tn-div-option.selected')]
      .map(el => Number(el.dataset.div));

    if (!name) {
      errEl.innerHTML = `<span class="msg-err">Ponle un nombre al torneo</span>`;
      return;
    }
    if (ratingMin >= ratingMax) {
      errEl.innerHTML = `<span class="msg-err">El mínimo debe ser menor al máximo</span>`;
      return;
    }

    const mySubs   = state.submissions[user.handle] || [];
    const excluded = new Set(
      mySubs.filter(s => s.verdict === 'OK' && s.problem)
            .map(s => `${s.problem.contestId}-${s.problem.index}`)
    );

    const picked = pickProblems({
      problems: state.problems,
      ratingMin,
      ratingMax,
      tags,
      count,
      excludeSolved: excluded,
      forcedProblemRefs,
      minSolvedCount,
      divisions
    });
    if (!picked.length) {
      errEl.innerHTML = `<span class="msg-err">Sin problemas con esos filtros — amplía el rango</span>`;
      return;
    }

    if (btn) { btn.disabled = true; btn.textContent = 'Creando…'; }

    try {
      const created = createTournament({ name, problems: picked, creatorHandle: user.handle, participantHandles: _modal.participants });
      hydrateTournamentParticipants(created.id).catch(err => console.warn('No se pudo hidratar torneo recién creado:', err));
      window.hideCreateModal();
      loadTorneo();
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Crear torneo →'; }
    }
  };

  // ── Importar desde link ───────────────────────────────────
  window.joinTournamentFromUI = async () => {
    const input = document.getElementById('tnImportInput');
    const raw   = input.value.trim();
    if (!raw) return;
    showMsg('Procesando…');

    try {
      let tParam = raw;
      if (raw.startsWith('http') || raw.includes('?t=')) {
        const url = raw.startsWith('http') ? raw : `https://x.com/?${raw.includes('?') ? raw.split('?')[1] : raw}`;
        tParam = new URL(url).searchParams.get('t');
      }
      if (!tParam) throw new Error('Link inválido — pega el link completo');

      const data = decodeTournamentFromURL(tParam);
      if (!data) throw new Error('Link corrupto o inválido');

      const imported = importTournament(data);
      hydrateTournamentParticipants(imported.id).catch(err => console.warn('No se pudo hidratar torneo importado:', err));
      input.value = '';
      showMsg(`✓ Torneo "${data.name}" importado correctamente`);
      loadTorneo();
    } catch (err) {
      showMsg(`✗ ${err.message}`, true);
    }
  };

  // ── Copiar link ───────────────────────────────────────────
  window.copyShareLink = (id) => {
    const t = state.tournaments.find(t => t.id === id);
    if (!t) return;
    const link = getTournamentShareLink(t);
    navigator.clipboard.writeText(link)
      .then(() => showMsg('✓ Link copiado — compártelo con tus amigos'))
      .catch(() => prompt('Copia este link:', link));
  };

  // ── Verificar soluciones ──────────────────────────────────
  window.verifyUI = async (id) => {
    const btn   = document.getElementById(`tnVBtn-${id}`);
    const hint  = document.getElementById(`tnVHint-${id}`);
    if (!btn) return;

    btn.disabled  = true;
    btn.textContent = '↻ Verificando…';

    try {
      const result = await verifySolutions(id, user.handle, () => {});
      if (!result) throw new Error('Torneo no encontrado');

      const { tournament: updated, newlySolved } = result;
      btn.textContent = newlySolved > 0
        ? `✓ ${newlySolved} nuevo${newlySolved > 1 ? 's' : ''} resuelto${newlySolved > 1 ? 's' : ''}`
        : '✓ Sin cambios nuevos';
      if (hint) hint.textContent = `Actualizado: ${timeAgo(updated.lastUpdated)}`;

      // Re-render solo la card
      const card = document.getElementById(`tnc-${id}`);
      if (card) {
        const tmp = document.createElement('div');
        tmp.innerHTML = renderCard(updated);
        card.replaceWith(tmp.firstElementChild);
      }
      bindGlobals();
    } catch (err) {
      btn.disabled  = false;
      btn.textContent = '↻ Actualizar mi progreso';
      if (hint) hint.textContent = `Error: ${err.message}`;
    }
  };

  window.syncAllParticipantsUI = async (id) => {
    const btn = document.getElementById(`tnSyncAll-${id}`);
    const hint = document.getElementById(`tnVHint-${id}`);
    if (!btn) return;

    btn.disabled = true;
    btn.textContent = '↻ Sincronizando…';
    if (hint) hint.textContent = 'Actualizando submits de todos los participantes…';

    try {
      const result = await syncTournamentParticipants(id);
      if (!result) throw new Error('Torneo no encontrado');
      const { tournament: updated, synced } = result;
      btn.textContent = `✓ ${synced} sincronizados`;
      if (hint) hint.textContent = `Actualizado: ${timeAgo(updated.lastUpdated)} · global: ${timeAgo(updated.lastGlobalSyncAt)}`;

      const card = document.getElementById(`tnc-${id}`);
      if (card) {
        const tmp = document.createElement('div');
        tmp.innerHTML = renderCard(updated);
        card.replaceWith(tmp.firstElementChild);
      }
      bindGlobals();
    } catch (err) {
      btn.disabled = false;
      btn.textContent = '↻ Sincronizar participantes del torneo';
      if (hint) hint.textContent = `Error: ${err.message}`;
    }
  };

  // ── Eliminar ──────────────────────────────────────────────
  window.deleteTournamentUI = (id) => {
    if (!confirm('¿Eliminar este torneo? No se puede deshacer.')) return;
    try {
      deleteTournament(id, user.handle);
      loadTorneo();
    } catch (err) {
      alert(err.message);
    }
  };
}

async function hydrateVisibleTournaments() {
  const candidates = state.tournaments.filter(t => {
    if (_autoSyncingTournamentIds.has(t.id)) return false;
    if (!t.lastGlobalSyncAt) return true;
    return t.participants.some(p => !p.lastSyncedAt);
  });

  for (const tournament of candidates) {
    _autoSyncingTournamentIds.add(tournament.id);
    hydrateTournamentParticipants(tournament.id)
      .then(() => loadTorneo())
      .catch(err => console.warn(`No se pudo hidratar torneo ${tournament.id}:`, err))
      .finally(() => _autoSyncingTournamentIds.delete(tournament.id));
  }
}

// ── UI helpers ─────────────────────────────────────────────

function showMsg(text, isErr = false) {
  const el = document.getElementById('tnMsg');
  if (!el) return;
  el.innerHTML = `<span class="${isErr ? 'msg-err' : 'msg-ok'}">${text}</span>`;
  if (!isErr) setTimeout(() => { el.innerHTML = ''; }, 5000);
}

function timeAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60)  return 'hace unos segundos';
  const m = Math.floor(s / 60);
  if (m < 60)  return `hace ${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24)  return `hace ${h}h`;
  return `hace ${Math.floor(h / 24)}d`;
}

function formatMs(ms) {
  if (!ms || ms <= 0) return '—';
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sc = s % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m ${String(sc).padStart(2,'0')}s`;
}

function ratingPill(r) {
  if (!r)        return 'purple';
  if (r <= 1199) return '';
  if (r <= 1399) return 'green';
  if (r <= 1599) return 'blue';
  if (r <= 1899) return 'purple';
  if (r <= 2199) return 'amber';
  return 'red';
}

function getHandleInitial(handle) {
  return handle?.trim()?.charAt(0)?.toUpperCase?.() || '?';
}

function renderProblemSubmitSplit(tournament, problemKey, currentHandle) {
  let mine = 0;
  let others = 0;
  for (const [handle, cache] of Object.entries(tournament.submissionsByHandle || {})) {
    const matches = (cache?.submissions || []).filter(sub =>
      `${sub?.problem?.contestId}-${sub?.problem?.index}` === problemKey
    ).length;
    if (!matches) continue;
    if (handle.toLowerCase() === currentHandle.toLowerCase()) mine += matches;
    else others += matches;
  }
  return `<div class="tn-p-subsplit"><span class="tn-p-sub-mine">Tú ${mine}</span><span class="tn-p-sub-other">Otros ${others}</span></div>`;
}
