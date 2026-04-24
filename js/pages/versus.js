import { state } from '../core/state.js';
import {
  getSolvedProblems,
  getTagStats,
  getCurrentStreak,
  getBestStreak,
  getEfficiency,
  getActivityHeatmap
} from '../services/stats.js';

// Cache local para no re-fetchear el historial de rating
const _ratingCache = {};

// ── Entry point ────────────────────────────────────────────────────────────────

export async function loadVersus() {
  const page = document.querySelector('.page[data-page="versus"]');
  if (!page) return;

  const user    = state.currentUser;
  const friends = state.friends;

  if (!friends.length) {
    page.innerHTML = `
      <div class="page-header">
        <div class="page-title">Versus</div>
        <div class="page-sub">Compárate con tus amigos</div>
      </div>
      <div class="card versus-empty">
        <div class="versus-empty-icon">⚔️</div>
        <p>Aún no tienes amigos agregados</p>
        <button onclick="navigateFromSidebar('friends')" style="margin-top:14px;">
          + Agregar amigos
        </button>
      </div>
    `;
    return;
  }

  // Handle seleccionado (persiste entre navegaciones)
  const validHandle = friends.some(f => f.handle === state.ui.versusHandle)
    ? state.ui.versusHandle
    : friends[0].handle;
  state.ui.versusHandle = validHandle;

  const friend     = friends.find(f => f.handle === validHandle);
  const mySubs     = state.submissions[user.handle?.toLowerCase()]   || [];
  const friendSubs = state.submissions[friend.handle?.toLowerCase()] || [];

  page.innerHTML = buildLayout(user, friend, friends, validHandle);

  renderVersusStats(mySubs, friendSubs, user, friend);
  renderTagMatchup(mySubs, friendSubs, user.handle, friend.handle);
  renderVersusHeatmaps(mySubs, friendSubs, user.handle, friend.handle);
  fetchAndRenderRatingHistory(user.handle, friend.handle);

  window.changeVersusHandle = handle => {
    state.ui.versusHandle = handle;
    loadVersus();
  };
}

// ── Layout ─────────────────────────────────────────────────────────────────────

function buildLayout(user, friend, friends, selectedHandle) {
  return `
    <div class="page-header">
      <div class="page-title">Versus</div>
      <div class="page-sub">Comparación directa</div>
    </div>

    <div class="versus-selector-row">
      <span class="versus-selector-label">Comparar con:</span>
      <select id="versusSelect" class="versus-select"
              onchange="changeVersusHandle(this.value)">
        ${friends.map(f => `
          <option value="${f.handle}" ${f.handle === selectedHandle ? 'selected' : ''}>
            ${f.handle}${f.rating ? '  (' + f.rating + ')' : ''}
          </option>`).join('')}
      </select>
    </div>

    <!-- Hero -->
    <div class="versus-hero">
      <div class="versus-side versus-side-me">
        <img class="versus-avatar" src="${user.avatar}" alt="${user.handle}">
        <div class="versus-uname">${user.name}</div>
        <div class="versus-handle-text">${user.handle}</div>
        <div class="versus-rating-val" style="color:${ratingColor(user.rating)}">
          ${user.rating || 'unrated'}
        </div>
        <div class="versus-rank-text">${user.rank || '—'}</div>
      </div>

      <div class="versus-center">
        <div class="versus-vs-badge">VS</div>
      </div>

      <div class="versus-side versus-side-friend">
        <img class="versus-avatar" src="${friend.avatar}" alt="${friend.handle}">
        <div class="versus-uname">${friend.handle}</div>
        <div class="versus-handle-text">${friend.handle}</div>
        <div class="versus-rating-val" style="color:${ratingColor(friend.rating)}">
          ${friend.rating || 'unrated'}
        </div>
        <div class="versus-rank-text">${friend.rank || '—'}</div>
      </div>
    </div>

    <!-- Stats -->
    <div class="card" id="versusStats"></div>

    <!-- Rating history -->
    <div class="card">
      <div class="card-header-row">
        <h2>Historial de rating</h2>
        <div style="display:flex;align-items:center;gap:10px;">
          <span class="legend-dot" style="background:var(--blue)"></span>
          <span class="chart-hint">${user.handle}</span>
          <span class="legend-dot" style="background:var(--amber)"></span>
          <span class="chart-hint">${friend.handle}</span>
        </div>
      </div>
      <div id="ratingChart">
        <div class="versus-loading">↻ Cargando historial de contests...</div>
      </div>
    </div>

    <!-- Tag matchup -->
    <div class="card">
      <div class="card-header-row">
        <h2>Batalla de categorías</h2>
        <span class="chart-hint">problemas resueltos por tag</span>
      </div>
      <div id="tagMatchup"></div>
    </div>

    <!-- Heatmaps -->
    <div class="card">
      <div class="card-header-row">
        <h2>Actividad comparada</h2>
        <span class="chart-hint">últimos 6 meses</span>
      </div>
      <div id="versusHeatmaps"></div>
    </div>
  `;
}

// ── Stats comparison ───────────────────────────────────────────────────────────

function renderVersusStats(mySubs, frSubs, user, friend) {
  const el = document.getElementById('versusStats');
  if (!el) return;

  const my = {
    solved:     getSolvedProblems(mySubs),
    streak:     getCurrentStreak(mySubs),
    bestStreak: getBestStreak(mySubs),
    efficiency: getEfficiency(mySubs),
    total:      mySubs.length
  };
  const fr = {
    solved:     getSolvedProblems(frSubs),
    streak:     getCurrentStreak(frSubs),
    bestStreak: getBestStreak(frSubs),
    efficiency: getEfficiency(frSubs),
    total:      frSubs.length
  };

  const rows = [
    { label: 'Resueltos',    myVal: my.solved,     frVal: fr.solved,     unit: '' },
    { label: 'Rating',       myVal: user.rating||0, frVal: friend.rating||0, unit: '' },
    { label: 'Racha actual', myVal: my.streak,     frVal: fr.streak,     unit: 'd' },
    { label: 'Mejor racha',  myVal: my.bestStreak, frVal: fr.bestStreak, unit: 'd' },
    { label: 'Efectividad',  myVal: my.efficiency, frVal: fr.efficiency, unit: '%' },
    { label: 'Submissions',  myVal: my.total,      frVal: fr.total,      unit: '' }
  ];

  const myWins = rows.filter(r => r.myVal > r.frVal).length;
  const frWins = rows.filter(r => r.frVal > r.myVal).length;

  el.innerHTML = `
    <div class="card-header-row" style="margin-bottom:16px;">
      <h2>Estadísticas</h2>
      <div class="versus-scoreboard">
        <span class="vs-score-me">${myWins}</span>
        <span class="vs-score-sep">—</span>
        <span class="vs-score-fr">${frWins}</span>
      </div>
    </div>
    ${rows.map(r => renderStatRow(r)).join('')}
  `;
}

function renderStatRow({ label, myVal, frVal, unit }) {
  const total  = (myVal + frVal) || 1;
  const myPct  = Math.round((myVal / total) * 100);
  const frPct  = 100 - myPct;
  const myWins = myVal > frVal;
  const frWins = frVal > myVal;

  return `
    <div class="versus-stat-row">
      <div class="versus-stat-val ${myWins ? 'vstat-win' : frWins ? 'vstat-lose' : ''}">
        ${myVal}${unit}
      </div>
      <div class="versus-stat-mid">
        <div class="versus-stat-label">${label}</div>
        <div class="versus-bar-wrap">
          <div class="versus-bar-my"
               style="width:${myPct}%;opacity:${myWins ? 1 : 0.35}"></div>
          <div class="versus-bar-fr"
               style="width:${frPct}%;opacity:${frWins ? 1 : 0.35}"></div>
        </div>
      </div>
      <div class="versus-stat-val ${frWins ? 'vstat-win-fr' : myWins ? 'vstat-lose' : ''}">
        ${frVal}${unit}
      </div>
    </div>
  `;
}

// ── Rating history chart ───────────────────────────────────────────────────────

async function fetchAndRenderRatingHistory(myHandle, frHandle) {
  try {
    const [myH, frH] = await Promise.all([
      fetchRatingHistory(myHandle),
      fetchRatingHistory(frHandle)
    ]);
    renderRatingChart(myH, frH);
  } catch (e) {
    const el = document.getElementById('ratingChart');
    if (el) el.innerHTML = `<p class="empty-msg">Error cargando historial: ${e.message}</p>`;
  }
}

async function fetchRatingHistory(handle) {
  if (_ratingCache[handle]) return _ratingCache[handle];
  const res  = await fetch(`https://codeforces.com/api/user.rating?handle=${handle}`);
  const data = await res.json();
  if (data.status !== 'OK') return [];
  _ratingCache[handle] = data.result;
  return data.result;
}

function renderRatingChart(myHistory, frHistory) {
  const el = document.getElementById('ratingChart');
  if (!el) return;

  if (!myHistory.length && !frHistory.length) {
    el.innerHTML = '<p class="empty-msg">Sin historial de contests aún</p>';
    return;
  }

  const W = 820, H = 230;
  const pL = 48, pR = 24, pT = 18, pB = 36;
  const cW = W - pL - pR;
  const cH = H - pT - pB;

  const all   = [...myHistory, ...frHistory];
  const times = all.map(p => p.ratingUpdateTimeSeconds);
  const rates = all.map(p => p.newRating);

  const minT = Math.min(...times);
  const maxT = Math.max(...times);
  const minR = Math.floor(Math.min(...rates) / 200) * 200 - 100;
  const maxR = Math.ceil(Math.max(...rates)  / 200) * 200 + 100;

  const tx = t => pL + ((t - minT) / ((maxT - minT) || 1)) * cW;
  const ty = r => pT + (1 - (r - minR) / ((maxR - minR) || 1)) * cH;

  // Rating thresholds grid
  const THRESHOLDS = [800,1200,1400,1600,1900,2100,2300,2400,2600,3000];
  const grids = THRESHOLDS
    .filter(r => r >= minR && r <= maxR)
    .map(r => `
      <line x1="${pL}" y1="${ty(r)}" x2="${W-pR}" y2="${ty(r)}"
            stroke="var(--border)" stroke-width="0.5" stroke-dasharray="3,4"/>
      <text x="${pL-5}" y="${ty(r)+3}" text-anchor="end"
            font-size="8" fill="var(--muted)" font-family="var(--mono)">${r}</text>
    `).join('');

  // Year labels
  const seenYears = new Set();
  const yearLabels = all
    .sort((a, b) => a.ratingUpdateTimeSeconds - b.ratingUpdateTimeSeconds)
    .map(p => {
      const y = new Date(p.ratingUpdateTimeSeconds * 1000).getFullYear();
      if (seenYears.has(y)) return '';
      seenYears.add(y);
      return `<text x="${tx(p.ratingUpdateTimeSeconds)}" y="${pT + cH + 22}"
              text-anchor="middle" font-size="9" fill="var(--muted)"
              font-family="var(--mono)">${y}</text>`;
    }).join('');

  const area = (hist, color) => {
    if (hist.length < 2) return '';
    const pts   = hist.map(p => `${tx(p.ratingUpdateTimeSeconds).toFixed(1)},${ty(p.newRating).toFixed(1)}`).join(' ');
    const first = hist[0];
    const last  = hist[hist.length - 1];
    const bot   = pT + cH;
    return `<polygon points="${tx(first.ratingUpdateTimeSeconds).toFixed(1)},${bot} ${pts} ${tx(last.ratingUpdateTimeSeconds).toFixed(1)},${bot}"
             fill="${color}" fill-opacity="0.07"/>`;
  };

  const line = (hist, color) => {
    if (!hist.length) return '';
    const pts = hist.map(p => `${tx(p.ratingUpdateTimeSeconds).toFixed(1)},${ty(p.newRating).toFixed(1)}`).join(' ');
    return `<polyline points="${pts}" fill="none" stroke="${color}"
             stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
  };

  const endDot = (hist, color) => {
    if (!hist.length) return '';
    const p  = hist[hist.length - 1];
    const cx = tx(p.ratingUpdateTimeSeconds);
    const cy = ty(p.newRating);
    return `
      <circle cx="${cx}" cy="${cy}" r="4" fill="${color}" stroke="var(--bg)" stroke-width="2"/>
      <text x="${cx + 8}" y="${cy + 4}" font-size="9" fill="${color}" font-family="var(--mono)"
            font-weight="600">${p.newRating}</text>
    `;
  };

  el.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" width="100%" style="overflow:visible;display:block;">
      ${grids}
      <line x1="${pL}" y1="${pT}" x2="${pL}" y2="${pT+cH}"
            stroke="var(--border-hi)" stroke-width="1"/>
      <line x1="${pL}" y1="${pT+cH}" x2="${W-pR}" y2="${pT+cH}"
            stroke="var(--border)" stroke-width="0.5"/>
      ${area(myHistory, 'var(--blue)')}
      ${area(frHistory, 'var(--amber)')}
      ${line(myHistory, 'var(--blue)')}
      ${line(frHistory, 'var(--amber)')}
      ${endDot(myHistory, 'var(--blue)')}
      ${endDot(frHistory, 'var(--amber)')}
      ${yearLabels}
    </svg>
  `;
}

// ── Tag matchup ────────────────────────────────────────────────────────────────

function renderTagMatchup(mySubs, frSubs, myHandle, frHandle) {
  const el = document.getElementById('tagMatchup');
  if (!el) return;

  const myTags = getTagStats(mySubs);
  const frTags = getTagStats(frSubs);

  const allTags = [...new Set([...Object.keys(myTags), ...Object.keys(frTags)])]
    .map(tag => ({ tag, my: myTags[tag] || 0, fr: frTags[tag] || 0 }))
    .sort((a, b) => (b.my + b.fr) - (a.my + a.fr))
    .slice(0, 20);

  if (!allTags.length) {
    el.innerHTML = '<p class="empty-msg">Sin datos aún</p>';
    return;
  }

  const maxVal = Math.max(...allTags.map(t => Math.max(t.my, t.fr)), 1);

  el.innerHTML = `
    <div class="tvs-header">
      <span class="tvs-label-me">${myHandle}</span>
      <span></span>
      <span class="tvs-label-fr">${frHandle}</span>
    </div>
    <div class="tvs-list">
      ${allTags.map(({ tag, my, fr }) => {
        const myPct  = Math.round((my  / maxVal) * 100);
        const frPct  = Math.round((fr  / maxVal) * 100);
        const myWins = my > fr;
        const frWins = fr > my;
        return `
          <div class="tvs-row">
            <div class="tvs-side tvs-left">
              <span class="tvs-count ${myWins ? 'tvs-win-me' : ''}">${my}</span>
              <div class="tvs-track">
                <div class="tvs-bar-my"
                     style="width:${myPct}%;opacity:${myWins?1:.35}"></div>
              </div>
            </div>
            <div class="tvs-tag">${tag}</div>
            <div class="tvs-side tvs-right">
              <div class="tvs-track">
                <div class="tvs-bar-fr"
                     style="width:${frPct}%;opacity:${frWins?1:.35}"></div>
              </div>
              <span class="tvs-count ${frWins ? 'tvs-win-fr' : ''}">${fr}</span>
            </div>
          </div>`;
      }).join('')}
    </div>
  `;
}

// ── Heatmaps ───────────────────────────────────────────────────────────────────

function renderVersusHeatmaps(mySubs, frSubs, myHandle, frHandle) {
  const el = document.getElementById('versusHeatmaps');
  if (!el) return;

  el.innerHTML = `
    <div class="versus-heatmap-block">
      <div class="versus-heatmap-name" style="color:var(--blue)">${myHandle}</div>
      <div id="vheat-me"></div>
    </div>
    <div class="versus-heatmap-block" style="margin-top:18px;">
      <div class="versus-heatmap-name" style="color:var(--amber)">${frHandle}</div>
      <div id="vheat-fr"></div>
    </div>
  `;

  drawMiniHeatmap('vheat-me', getActivityHeatmap(mySubs),  'var(--blue)');
  drawMiniHeatmap('vheat-fr', getActivityHeatmap(frSubs), 'var(--amber)');
}

function drawMiniHeatmap(containerId, activity, color) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const WEEKS = 26;
  const today = new Date();
  today.setHours(0,0,0,0);
  const max = Math.max(1, ...Object.values(activity).map(Number));

  const cols = [];
  const cursor = new Date(today);
  cursor.setDate(today.getDate() - WEEKS * 7 + 1);

  while (cursor <= today) {
    const week = [];
    for (let d = 0; d < 7; d++) {
      const key   = dayKey(new Date(cursor));
      const count = activity[key] || 0;
      const lv    = count === 0 ? 0 : Math.ceil((count / max) * 4);
      week.push({ key, count, lv });
      cursor.setDate(cursor.getDate() + 1);
    }
    cols.push(week);
  }

  const MONTHS      = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  const monthLabels = cols.map(w => new Date(w[0].key).getMonth());

  const alphas = [0, 0.15, 0.35, 0.6, 1];

  container.innerHTML = `
    <div class="heatmap-wrap">
      <div class="heatmap-months">
        ${cols.map((_, i) => {
          const m    = monthLabels[i];
          const show = i === 0 || monthLabels[i] !== monthLabels[i - 1];
          return `<div class="heatmap-month-cell">${show ? MONTHS[m] : ''}</div>`;
        }).join('')}
      </div>
      <div class="heatmap-grid">
        ${cols.map(week => `
          <div class="heatmap-col">
            ${week.map(day => {
              const alpha = alphas[day.lv];
              const style = day.lv > 0
                ? `background:${color};opacity:${alpha};border-color:${color}`
                : '';
              return `<div class="heatmap-cell" style="${style}" title="${day.key}: ${day.count}"></div>`;
            }).join('')}
          </div>`).join('')}
      </div>
    </div>
  `;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function ratingColor(r) {
  if (!r || r <= 1199) return '#888';
  if (r <= 1399) return 'var(--green)';
  if (r <= 1599) return 'var(--blue)';
  if (r <= 1899) return 'var(--purple)';
  if (r <= 2199) return 'var(--amber)';
  return 'var(--red)';
}

function dayKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
