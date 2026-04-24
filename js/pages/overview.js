import { state } from '../core/state.js';
import {
  getSolvedProblems,
  getCurrentStreak,
  getEfficiency
} from '../services/stats.js';

export function loadOverview() {
  const user = state.currentUser;
  const subs = state.submissions[user.handle] || state.submissions[user.handle?.toLowerCase()] || [];

  const me = {
    handle:     user.handle,
    avatar:     user.avatar,
    rating:     user.rating || 0,
    solved:     getSolvedProblems(subs),
    streak:     getCurrentStreak(subs),
    efficiency: getEfficiency(subs),
    isMe:       true
  };

  const friendRows = state.friends.map(f => {
    const fsubs = state.submissions[f.handle] || state.submissions[f.handle?.toLowerCase()] || [];
    return {
      handle:     f.handle,
      avatar:     f.avatar,
      rating:     f.rating || 0,
      solved:     getSolvedProblems(fsubs),
      streak:     getCurrentStreak(fsubs),
      efficiency: getEfficiency(fsubs),
      isMe:       false
    };
  });

  const all = [me, ...friendRows].sort((a, b) => b.rating - a.rating);
  const meRank = all.findIndex(u => u.isMe) + 1;

  document.getElementById('overviewContent').innerHTML = `

    <div class="grid" style="grid-template-columns: repeat(auto-fit, minmax(140px,1fr)); margin-bottom:16px;">
      <div class="stat"><div class="stat-label">Mi rating</div><strong class="purple">${me.rating}</strong></div>
      <div class="stat"><div class="stat-label">Resueltos</div><strong>${me.solved}</strong></div>
      <div class="stat"><div class="stat-label">Racha</div><strong class="green">${me.streak}d</strong></div>
      <div class="stat"><div class="stat-label">Efectividad</div><strong class="blue">${me.efficiency}%</strong></div>
      <div class="stat"><div class="stat-label">Ranking grupo</div><strong class="amber">#${meRank}</strong></div>
    </div>

    <div class="card">
      <h2>Leaderboard grupal</h2>
      ${all.map((u, i) => `
        <div class="lb-row ${u.isMe ? 'lb-me' : ''}">
          <span class="lb-pos ${i===0?'gold':i===1?'silver':i===2?'bronze':''}">${i+1}</span>
          <img class="lb-avatar" src="${u.avatar}" onerror="this.style.display='none'">
          <span class="lb-handle">${u.handle}${u.isMe ? ' <span class="me-badge">tú</span>' : ''}</span>
          <div class="lb-stats">
            <span class="pill purple">${u.rating}</span>
            <span class="pill blue">${u.solved} slv</span>
            <span class="pill green">${u.streak}d</span>
            <span class="pill teal">${u.efficiency}%</span>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}
