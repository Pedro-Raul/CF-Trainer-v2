import { state } from '../core/state.js';
import {
  getSolvedProblems,
  getTagStats,
  getWeakTags,
  getStrongTags,
  getCurrentStreak,
  getBestStreak,
  getActivityHeatmap,
  getRatingDistribution,
  getEfficiency
} from '../services/stats.js';
import { getRecommendationsByMode } from '../services/recommender.js';

export function loadIndividual() {
  const page = document.querySelector('.page[data-page="individual"]');
  if (!page) return;

  const user = state.currentUser;
  const subs = state.submissions[user.handle] || [];

  const solved     = getSolvedProblems(subs);
  const tagStats   = getTagStats(subs);
  const weak       = getWeakTags(tagStats, 8);
  const strong     = getStrongTags(tagStats, 8);
  const curStreak  = getCurrentStreak(subs);
  const bestStreak = getBestStreak(subs);
  const efficiency = getEfficiency(subs);
  const activity   = getActivityHeatmap(subs);
  const ratingDist = getRatingDistribution(subs);

  page.innerHTML = `
    <div class="page-header">
      <div class="page-title">Mi perfil</div>
      <div class="page-sub">${user.handle}</div>
    </div>

    <!-- HERO -->
    <div class="ind-hero">
      <div class="ind-hero-user">
        <img class="ind-avatar" src="${user.avatar}" alt="${user.handle}">
        <div class="ind-hero-info">
          <div class="ind-name">${user.name}</div>
          <div class="ind-handle">${user.handle}</div>
          <div class="ind-rating-badge">${user.rating || 'unrated'}</div>
        </div>
      </div>
      <div class="ind-hero-stats">
        <div class="ind-stat-big">
          <div class="ind-stat-val">${solved}</div>
          <div class="ind-stat-label">Resueltos</div>
        </div>
        <div class="ind-stat-divider"></div>
        <div class="ind-stat-big">
          <div class="ind-stat-val blue">${subs.length}</div>
          <div class="ind-stat-label">Submissions</div>
        </div>
        <div class="ind-stat-divider"></div>
        <div class="ind-stat-big">
          <div class="ind-stat-val teal">${efficiency}%</div>
          <div class="ind-stat-label">Efectividad</div>
        </div>
        <div class="ind-stat-divider"></div>
        <div class="ind-stat-big">
          <div class="ind-stat-val green">${curStreak}d</div>
          <div class="ind-stat-label">Racha actual</div>
        </div>
        <div class="ind-stat-divider"></div>
        <div class="ind-stat-big">
          <div class="ind-stat-val amber">${bestStreak}d</div>
          <div class="ind-stat-label">Mejor racha</div>
        </div>
      </div>
    </div>

    <!-- ACTIVIDAD -->
    <div class="card">
      <div class="card-header-row">
        <h2>Actividad diaria</h2>
        <span class="chart-hint">últimos 6 meses</span>
      </div>
      <div id="heatmap" style="display:flex;justify-content:center;"></div>
    </div>

    <!-- RATING DIST -->
    <div class="card">
      <div class="card-header-row">
        <h2>Problemas por rating</h2>
        <span class="chart-hint">${ratingDist.reduce((a,b) => a + b.count, 0)} resueltos</span>
      </div>
      <div id="ratingChart"></div>
    </div>

    <!-- ANÁLISIS DE TAGS -->
    <div class="card">
      <div class="card-header-row">
        <h2>Análisis por categoría</h2>
        <div style="display:flex;gap:6px;">
          <button class="tab-btn active" id="tab-bars"  onclick="switchTagView('bars')">Barras</button>
          <button class="tab-btn"        id="tab-radar" onclick="switchTagView('radar')">Radar</button>
          <button class="tab-btn"        id="tab-table" onclick="switchTagView('table')">Tabla</button>
        </div>
      </div>
      <div id="tagViewContent"></div>
    </div>

    <!-- RECOMENDACIONES -->
    <div class="card">
      <div class="card-header-row">
        <h2>Recomendaciones</h2>
        <div style="display:flex;gap:6px;align-items:center;">
          <span class="chart-hint" id="recModeLabel">por debilidades</span>
          <button class="tab-btn active" id="rec-weak"  onclick="switchRecMode('weak')">Débiles</button>
          <button class="tab-btn"        id="rec-level" onclick="switchRecMode('level')">Por nivel</button>
          <button class="tab-btn"        id="rec-any"   onclick="switchRecMode('any')">Explorar</button>
        </div>
      </div>
      <div id="recsIndividual"></div>
    </div>
  `;

  renderHeatmap(activity);
  renderRatingBars(ratingDist);
  renderTagBars(tagStats, strong, weak);
  renderRecs(user, subs, weak, 'weak');

  window.switchTagView = (mode) => {
    document.querySelectorAll('.tab-btn[id^="tab-"]').forEach(b => b.classList.remove('active'));
    const btn = document.getElementById(`tab-${mode}`);
    if (btn) btn.classList.add('active');
    if (mode === 'bars')  renderTagBars(tagStats, strong, weak);
    if (mode === 'radar') renderTagRadar(tagStats);
    if (mode === 'table') renderTagTable(tagStats, strong, weak);
  };

  window.switchRecMode = (mode) => {
    document.querySelectorAll('.tab-btn[id^="rec-"]').forEach(b => b.classList.remove('active'));
    const btn = document.getElementById(`rec-${mode}`);
    if (btn) btn.classList.add('active');
    const labels = {
      weak:  'por debilidades',
      level: 'por nivel de rating',
      any:   'explorar nuevos temas'
    };
    const lbl = document.getElementById('recModeLabel');
    if (lbl) lbl.textContent = labels[mode] || '';
    renderRecs(user, subs, weak, mode);
  };
}

// ── TAG VIEWS ──────────────────────────────────────────────

function renderTagBars(tagStats, strong, weak) {
  const el = document.getElementById('tagViewContent');
  if (!el) return;

  const allEntries = Object.entries(tagStats).sort((a, b) => b[1] - a[1]);
  if (!allEntries.length) {
    el.innerHTML = '<p class="empty-msg">Sin datos aún</p>';
    return;
  }

  const max       = allEntries[0][1];
  const weakSet   = new Set(weak.map(([t]) => t));
  const strongSet = new Set(strong.map(([t]) => t));

  el.innerHTML = `
    <div class="tag-bars-grid">
      ${allEntries.map(([tag, count]) => {
        const pct     = Math.round((count / max) * 100);
        const cls     = weakSet.has(tag) ? 'weak' : strongSet.has(tag) ? 'strong' : 'neutral';
        const color   = cls === 'weak' ? 'var(--red)' : cls === 'strong' ? 'var(--green)' : 'var(--blue)';
        const bgColor = cls === 'weak' ? 'var(--red-bg)' : cls === 'strong' ? 'var(--green-bg)' : 'var(--blue-bg)';
        const label   = cls === 'weak' ? '↓ débil' : cls === 'strong' ? '↑ fuerte' : '';
        return `
          <div class="tag-bar-row">
            <div class="tag-bar-label-wrap">
              <span class="tag-bar-name">${tag}</span>
              <span class="tag-bar-count" style="color:${color}">${count}</span>
            </div>
            <div class="tag-bar-track">
              <div class="tag-bar-fill" style="width:${pct}%;background:${color}"></div>
            </div>
            <span class="tag-bar-badge" style="background:${bgColor};color:${color}">${label}</span>
          </div>`;
      }).join('')}
    </div>
    <div class="tag-legend">
      <span class="legend-dot" style="background:var(--green)"></span><span>Fuerte</span>
      <span class="legend-dot" style="background:var(--red)"></span><span>Débil</span>
      <span class="legend-dot" style="background:var(--blue)"></span><span>Normal</span>
    </div>
  `;
}

function renderTagRadar(tagStats) {
  const el = document.getElementById('tagViewContent');
  if (!el) return;

  const entries = Object.entries(tagStats).sort((a, b) => b[1] - a[1]).slice(0, 10);
  if (entries.length < 3) {
    el.innerHTML = '<p class="empty-msg">Necesitas más problemas resueltos para el radar</p>';
    return;
  }

  const size = 300;
  const cx   = size / 2;
  const cy   = size / 2;
  const r    = 110;
  const n    = entries.length;
  const max  = entries[0][1];

  const angle  = (i) => (Math.PI * 2 * i) / n - Math.PI / 2;
  const pt     = (i, val) => {
    const a = angle(i);
    const ratio = val / max;
    return { x: cx + r * ratio * Math.cos(a), y: cy + r * ratio * Math.sin(a) };
  };
  const outer  = (i) => {
    const a = angle(i);
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
  };

  const gridLines = [0.25, 0.5, 0.75, 1].map(ratio => {
    const pts = entries.map((_, i) => {
      const a = angle(i);
      return `${cx + r * ratio * Math.cos(a)},${cy + r * ratio * Math.sin(a)}`;
    }).join(' ');
    return `<polygon points="${pts}" fill="none" stroke="var(--border)" stroke-width="1"/>`;
  }).join('');

  const axes = entries.map((_, i) => {
    const o = outer(i);
    return `<line x1="${cx}" y1="${cy}" x2="${o.x}" y2="${o.y}" stroke="var(--border-hi)" stroke-width="1"/>`;
  }).join('');

  const dataPoints = entries.map(([, count], i) => pt(i, count));
  const polygon    = dataPoints.map(p => `${p.x},${p.y}`).join(' ');

  const labels = entries.map(([tag], i) => {
    const lx     = cx + (r + 20) * Math.cos(angle(i));
    const ly     = cy + (r + 20) * Math.sin(angle(i));
    const anchor = lx < cx - 4 ? 'end' : lx > cx + 4 ? 'start' : 'middle';
    const short  = tag.length > 13 ? tag.slice(0, 12) + '…' : tag;
    return `<text x="${lx}" y="${ly}" text-anchor="${anchor}" dominant-baseline="middle"
      font-size="9" fill="var(--muted)" font-family="'JetBrains Mono',monospace">${short}</text>`;
  }).join('');

  const dots = dataPoints.map(p =>
    `<circle cx="${p.x}" cy="${p.y}" r="3" fill="var(--blue)" stroke="var(--bg)" stroke-width="1.5"/>`
  ).join('');

  el.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;">
      <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="overflow:visible;margin:12px 0;">
        ${gridLines}
        ${axes}
        <polygon points="${polygon}"
          fill="var(--blue)" fill-opacity="0.15"
          stroke="var(--blue)" stroke-width="2" stroke-linejoin="round"/>
        ${dots}
        ${labels}
      </svg>
      <p style="font-size:10px;color:var(--muted);font-family:var(--mono);">
        Top ${entries.length} categorías · área = problemas resueltos
      </p>
    </div>
  `;
}

function renderTagTable(tagStats, strong, weak) {
  const el = document.getElementById('tagViewContent');
  if (!el) return;

  const entries = Object.entries(tagStats).sort((a, b) => b[1] - a[1]);
  if (!entries.length) {
    el.innerHTML = '<p class="empty-msg">Sin datos aún</p>';
    return;
  }

  const total     = entries.reduce((s, [, c]) => s + c, 0);
  const weakSet   = new Set(weak.map(([t]) => t));
  const strongSet = new Set(strong.map(([t]) => t));

  el.innerHTML = `
    <div class="tag-table-wrap">
      <table class="tag-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Categoría</th>
            <th>Resueltos</th>
            <th>% del total</th>
            <th>Estado</th>
          </tr>
        </thead>
        <tbody>
          ${entries.map(([tag, count], i) => {
            const pct   = ((count / total) * 100).toFixed(1);
            const cls   = weakSet.has(tag) ? 'weak' : strongSet.has(tag) ? 'strong' : '';
            const badge = weakSet.has(tag)
              ? '<span class="status-badge weak">↓ débil</span>'
              : strongSet.has(tag)
              ? '<span class="status-badge strong">↑ fuerte</span>'
              : '<span class="status-badge">—</span>';
            return `
              <tr class="${cls ? 'tr-' + cls : ''}">
                <td class="td-rank">${i + 1}</td>
                <td class="td-tag">${tag}</td>
                <td class="td-count">${count}</td>
                <td class="td-pct">
                  <div class="mini-bar-wrap">
                    <div class="mini-bar" style="width:${Math.min(parseFloat(pct), 100)}%"></div>
                    <span>${pct}%</span>
                  </div>
                </td>
                <td>${badge}</td>
              </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

// ── RECOMENDACIONES ────────────────────────────────────────

function renderRecs(user, subs, weak, mode) {
  const el = document.getElementById('recsIndividual');
  if (!el) return;

  const recs = getRecommendationsByMode(user, subs, state.problems, weak, mode);

  if (!recs.length) {
    el.innerHTML = '<p class="empty-msg">No hay recomendaciones para este filtro</p>';
    return;
  }

  el.innerHTML = `
    <div class="recs-grid">
      ${recs.map(p => {
        const tags   = (p.tags || []).slice(0, 3);
        const rColor = ratingColor(p.rating);
        return `
          <a class="rec-card"
             href="https://codeforces.com/problemset/problem/${p.contestId}/${p.index}"
             target="_blank">
            <div class="rec-card-top">
              <span class="rec-card-name">${p.name}</span>
              <span class="rec-card-rating" style="color:${rColor};background:${rColor}1a">${p.rating || '?'}</span>
            </div>
            <div class="rec-card-meta">
              <span class="rec-contest">${p.contestId}${p.index}</span>
              ${tags.map(t => `<span class="rec-tag">${t}</span>`).join('')}
            </div>
          </a>`;
      }).join('')}
    </div>
  `;
}

// ── HEATMAP ────────────────────────────────────────────────

function renderHeatmap(activity) {
  const container = document.getElementById('heatmap');
  if (!container) return;

  const WEEKS = 26;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const max = Math.max(1, ...Object.values(activity).map(Number));

  const cols   = [];
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
            ${week.map(day => `
              <div class="heatmap-cell lv${day.lv}" title="${day.key}: ${day.count} subs"></div>
            `).join('')}
          </div>`).join('')}
      </div>
      <div class="heatmap-legend">
        <span>Menos</span>
        <div class="heatmap-cell lv0"></div>
        <div class="heatmap-cell lv1"></div>
        <div class="heatmap-cell lv2"></div>
        <div class="heatmap-cell lv3"></div>
        <div class="heatmap-cell lv4"></div>
        <span>Más</span>
      </div>
    </div>
  `;
}

// ── RATING BARS ────────────────────────────────────────────

function renderRatingBars(dist) {
  const container = document.getElementById('ratingChart');
  if (!container) return;

  if (!dist.length) {
    container.innerHTML = '<p class="empty-msg">Sin datos</p>';
    return;
  }

  const max = Math.max(...dist.map(d => d.count));

  container.innerHTML = `
    <div class="rating-bars">
      ${dist.map(d => `
        <div class="rating-bar-wrap">
          <div class="rating-bar-count">${d.count}</div>
          <div class="rating-bar-track">
            <div class="rating-bar-fill"
                 style="height:${Math.round((d.count / max) * 100)}%;background:${ratingColor(d.rating)};">
            </div>
          </div>
          <div class="rating-bar-label">${d.rating}</div>
        </div>`).join('')}
    </div>
  `;
}

// ── Helpers ────────────────────────────────────────────────

function ratingColor(r) {
  if (!r || r <= 1199) return '#888780';
  if (r <= 1399) return '#4ade80';
  if (r <= 1599) return '#60a5fa';
  if (r <= 1899) return '#a78bfa';
  if (r <= 2199) return '#fbbf24';
  if (r <= 2399) return '#f87171';
  return '#ef4444';
}

function dayKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}