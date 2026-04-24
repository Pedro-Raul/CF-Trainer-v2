import { state } from '../core/state.js';
import { saveTournaments, loadTournaments } from '../core/storage.js';
import { getCFSubmissions } from './codeforces.js';

// ── Crear ──────────────────────────────────────────────────

export function createTournament({ name, problems, creatorHandle, participantHandles = [] }) {
  const seen = new Set([creatorHandle.toLowerCase()]);
  const participants = [{ handle: creatorHandle, solvedAt: {} }];

  for (const h of participantHandles) {
    const hl = h.trim().toLowerCase();
    if (hl && !seen.has(hl)) {
      seen.add(hl);
      participants.push({ handle: h.trim(), solvedAt: {} });
    }
  }

  const tournament = {
    id:           Date.now(),
    code:         generateCode(),
    name,
    creator:      creatorHandle,
    problems,
    participants,           // [{ handle, solvedAt: {} }]
    createdAt:    Date.now(),
    lastUpdated:  null
  };

  state.tournaments.push(tournament);
  saveTournaments(state.tournaments);
  return tournament;
}

// ── Unirse por código ──────────────────────────────────────

export function joinTournament(code, handle) {
  _syncFromStorage();
  const t = state.tournaments.find(t => t.code === code.toUpperCase().trim());
  if (!t) throw new Error('Código inválido — usa el link completo del creador');
  if (t.participants.some(p => p.handle.toLowerCase() === handle.toLowerCase())) {
    throw new Error('Ya estás en este torneo');
  }
  t.participants.push({ handle, solvedAt: {} });
  saveTournaments(state.tournaments);
  return t;
}

// ── Importar torneo desde link ─────────────────────────────

export function importTournament(data) {
  _syncFromStorage();
  const existing = state.tournaments.find(t => t.id === data.id);

  const incoming = {
    id:          data.id,
    code:        data.code,
    name:        data.name,
    creator:     data.creator,
    problems:    data.problems,
    participants: (data.participants || []).map(p =>
      typeof p === 'string'
        ? { handle: p, solvedAt: {} }
        : { handle: p.handle, solvedAt: p.solvedAt || {} }
    ),
    createdAt:   data.createdAt,
    lastUpdated: data.lastUpdated || null
  };

  if (existing) {
    // Merge: añadir participantes nuevos y mergear solvedAt
    for (const inc of incoming.participants) {
      const ex = existing.participants.find(
        p => p.handle.toLowerCase() === inc.handle.toLowerCase()
      );
      if (!ex) {
        existing.participants.push(inc);
      } else {
        // Preservar timestamps más tempranos
        for (const [k, ts] of Object.entries(inc.solvedAt)) {
          if (!ex.solvedAt[k] || ts < ex.solvedAt[k]) ex.solvedAt[k] = ts;
        }
      }
    }
    saveTournaments(state.tournaments);
    return existing;
  }

  state.tournaments.push(incoming);
  saveTournaments(state.tournaments);
  return incoming;
}

// ── Verificar soluciones contra CF ────────────────────────

export async function verifySolutions(tournamentId, handle, onProgress) {
  const t = state.tournaments.find(t => t.id === tournamentId);
  if (!t) return null;

  onProgress?.('fetching');
  const subs = await getCFSubmissions(handle);

  const problemKeys = new Set(t.problems.map(p => `${p.contestId}-${p.index}`));
  const participant = t.participants.find(
    p => p.handle.toLowerCase() === handle.toLowerCase()
  );
  if (!participant) return null;

  let newlySolved = 0;
  for (const sub of subs) {
    if (sub.verdict !== 'OK' || !sub.problem) continue;
    const key = `${sub.problem.contestId}-${sub.problem.index}`;
    if (!problemKeys.has(key)) continue;
    const ts = sub.creationTimeSeconds * 1000;
    if (!participant.solvedAt[key] || ts < participant.solvedAt[key]) {
      if (!participant.solvedAt[key]) newlySolved++;
      participant.solvedAt[key] = ts;
    }
  }

  t.lastUpdated = Date.now();
  saveTournaments(state.tournaments);
  return { tournament: t, newlySolved };
}

// ── Eliminar ───────────────────────────────────────────────

export function deleteTournament(id, handle) {
  const t = state.tournaments.find(t => t.id === id);
  if (!t) throw new Error('Torneo no encontrado');
  if (t.creator.toLowerCase() !== handle.toLowerCase()) {
    throw new Error('Solo el creador puede eliminar este torneo');
  }
  state.tournaments = state.tournaments.filter(t => t.id !== id);
  saveTournaments(state.tournaments);
}

// ── Leaderboard ────────────────────────────────────────────

export function getLeaderboard(tournament) {
  return tournament.participants
    .map(p => {
      const solvedAt = p.solvedAt || {};
      const count    = Object.keys(solvedAt).length;
      const totalMs  = Object.values(solvedAt)
        .reduce((sum, ts) => sum + Math.max(0, ts - tournament.createdAt), 0);
      return { handle: p.handle, solvedAt, count, totalMs };
    })
    .sort((a, b) => b.count - a.count || a.totalMs - b.totalMs);
}

// ── Seleccionar problemas ─────────────────────────────────

export function pickProblems({ problems, ratingMin, ratingMax, tags, count, excludeSolved }) {
  let pool = problems.filter(p => {
    if (!p.rating) return false;
    if (p.rating < ratingMin || p.rating > ratingMax) return false;
    if (tags.length && !p.tags?.some(t => tags.includes(t))) return false;
    if (excludeSolved.has(`${p.contestId}-${p.index}`)) return false;
    return true;
  });
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count);
}

// ── Compartir link ─────────────────────────────────────────

export function getTournamentShareLink(tournament) {
  const payload = {
    id:           tournament.id,
    code:         tournament.code,
    name:         tournament.name,
    creator:      tournament.creator,
    problems:     tournament.problems,
    participants: tournament.participants,
    createdAt:    tournament.createdAt,
    lastUpdated:  tournament.lastUpdated
  };
  const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
  return `${location.origin}${location.pathname}?t=${encoded}`;
}

export function decodeTournamentFromURL(encoded) {
  try {
    return JSON.parse(decodeURIComponent(escape(atob(encoded))));
  } catch {
    return null;
  }
}

// ── Privados ───────────────────────────────────────────────

function _syncFromStorage() {
  const stored   = loadTournaments();
  const stateIds = new Set(state.tournaments.map(t => t.id));
  stored.forEach(t => { if (!stateIds.has(t.id)) state.tournaments.push(t); });
}

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}