import { state } from '../core/state.js';
import { saveTournaments, loadTournaments, saveSubmissions } from '../core/storage.js';
import { getCFSubmissions } from './codeforces.js';

const SUBMISSION_FIELDS = ['id', 'verdict', 'creationTimeSeconds', 'problem'];

// ── Crear ──────────────────────────────────────────────────

export function createTournament({ name, problems, creatorHandle, participantHandles = [] }) {
  const seen = new Set([creatorHandle.toLowerCase()]);
  const participants = [{ handle: creatorHandle, role: 'creator', solvedAt: {}, lastSyncedAt: null }];

  for (const h of participantHandles) {
    const hl = h.trim().toLowerCase();
    if (hl && !seen.has(hl)) {
      seen.add(hl);
      participants.push({ handle: h.trim(), role: 'participant', solvedAt: {}, lastSyncedAt: null });
    }
  }

  const tournament = {
    id:           Date.now(),
    code:         generateCode(),
    name,
    creator:      creatorHandle,
    problems,
    participants,           // [{ handle, role, solvedAt, lastSyncedAt }]
    submissionsByHandle: {},
    createdAt:    Date.now(),
    lastUpdated:  null,
    lastGlobalSyncAt: null
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
  t.participants.push({ handle, role: 'participant', solvedAt: {}, lastSyncedAt: null });
  saveTournaments(state.tournaments);
  return t;
}

// ── Importar torneo desde link ─────────────────────────────

export function importTournament(data) {
  _syncFromStorage();
  const incoming = normalizeTournamentShape(data);
  const existing = state.tournaments.find(t => t.id === data.id);

  if (existing) {
    // Merge: añadir participantes nuevos y mergear solvedAt
    for (const inc of incoming.participants) {
      const ex = existing.participants.find(
        p => p.handle.toLowerCase() === inc.handle.toLowerCase()
      );
      if (!ex) {
        existing.participants.push(inc);
      } else {
        ex.role = ex.role || inc.role;
        ex.lastSyncedAt = Math.max(ex.lastSyncedAt || 0, inc.lastSyncedAt || 0) || null;
        // Preservar timestamps más tempranos
        for (const [k, ts] of Object.entries(inc.solvedAt)) {
          if (!ex.solvedAt[k] || ts < ex.solvedAt[k]) ex.solvedAt[k] = ts;
        }
      }
    }
    for (const [handle, payload] of Object.entries(incoming.submissionsByHandle || {})) {
      const key = handle.toLowerCase();
      const current = existing.submissionsByHandle[key];
      if (!current || (payload.updatedAt || 0) > (current.updatedAt || 0)) {
        existing.submissionsByHandle[key] = payload;
      }
    }
    existing.lastGlobalSyncAt = Math.max(existing.lastGlobalSyncAt || 0, incoming.lastGlobalSyncAt || 0) || null;
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
  const subs = await ensureHandleSubmissions(handle, { forceRefresh: true });
  const normalizedHandle = handle.toLowerCase();

  const problemKeys = new Set(t.problems.map(p => `${p.contestId}-${p.index}`));
  const participant = t.participants.find(
    p => p.handle.toLowerCase() === normalizedHandle
  );
  if (!participant) return null;

  const beforeSolved = Object.keys(participant.solvedAt || {}).length;
  participant.solvedAt = deriveSolvedAtForParticipant(subs, problemKeys);
  const afterSolved = Object.keys(participant.solvedAt || {}).length;
  const newlySolved = Math.max(0, afterSolved - beforeSolved);

  t.submissionsByHandle[normalizedHandle] = {
    updatedAt: Date.now(),
    submissions: reduceTournamentSubmissions(subs, problemKeys)
  };
  participant.lastSyncedAt = Date.now();
  t.lastUpdated = Date.now();
  saveTournaments(state.tournaments);
  return { tournament: t, newlySolved };
}

export async function syncTournamentParticipants(tournamentId, onProgress) {
  const t = state.tournaments.find(item => item.id === tournamentId);
  if (!t) return null;

  const problemKeys = new Set(t.problems.map(p => `${p.contestId}-${p.index}`));
  let synced = 0;

  for (const participant of t.participants) {
    onProgress?.({ handle: participant.handle, status: 'fetching' });
    const subs = await ensureHandleSubmissions(participant.handle, { forceRefresh: true });
    const handle = participant.handle.toLowerCase();

    participant.solvedAt = deriveSolvedAtForParticipant(subs, problemKeys);

    participant.lastSyncedAt = Date.now();
    t.submissionsByHandle[handle] = {
      updatedAt: Date.now(),
      submissions: reduceTournamentSubmissions(subs, problemKeys)
    };
    synced++;
    onProgress?.({ handle: participant.handle, status: 'done' });
  }

  t.lastUpdated = Date.now();
  t.lastGlobalSyncAt = Date.now();
  saveTournaments(state.tournaments);
  return { tournament: t, synced };
}

export async function hydrateTournamentParticipants(tournamentId, onProgress) {
  const t = state.tournaments.find(item => item.id === tournamentId);
  if (!t) return null;

  const problemKeys = new Set(t.problems.map(p => `${p.contestId}-${p.index}`));
  let hydrated = 0;

  for (const participant of t.participants) {
    const handle = participant.handle.toLowerCase();
    onProgress?.({ handle, status: 'fetching' });

    const subs = await ensureHandleSubmissions(handle);
    participant.solvedAt = deriveSolvedAtForParticipant(subs, problemKeys);
    participant.lastSyncedAt = Date.now();

    t.submissionsByHandle[handle] = {
      updatedAt: Date.now(),
      submissions: reduceTournamentSubmissions(subs, problemKeys)
    };
    hydrated++;
    onProgress?.({ handle, status: 'done' });
  }

  t.lastUpdated = Date.now();
  t.lastGlobalSyncAt = Date.now();
  saveTournaments(state.tournaments);
  return { tournament: t, hydrated };
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

export function pickProblems({
  problems,
  ratingMin,
  ratingMax,
  tags,
  count,
  excludeSolved,
  forcedProblemRefs = [],
  minSolvedCount = 0,
  divisions = []
}) {
  const byKey = new Map(problems.map(p => [`${p.contestId}-${p.index}`.toLowerCase(), p]));
  const selected = [];
  const selectedKeys = new Set();

  for (const ref of forcedProblemRefs) {
    const key = normalizeProblemRef(ref);
    if (!key) continue;
    const forced = byKey.get(key);
    if (!forced || selectedKeys.has(key)) continue;
    selected.push(forced);
    selectedKeys.add(key);
    if (selected.length >= count) return selected.slice(0, count);
  }

  const targetRating = Math.round((ratingMin + ratingMax) / 2);
  const desiredDivisions = new Set(divisions.map(Number).filter(Boolean));

  const pool = problems.filter(p => {
    const key = `${p.contestId}-${p.index}`;
    if (selectedKeys.has(key.toLowerCase())) return false;
    if (!p.rating) return false;
    if (p.rating < ratingMin || p.rating > ratingMax) return false;
    if (tags.length && !p.tags?.some(t => tags.includes(t))) return false;
    if (excludeSolved.has(key)) return false;
    if (desiredDivisions.size && !desiredDivisions.has(p.division)) return false;
    if ((p.solvedCount || 0) < minSolvedCount) return false;
    return true;
  });

  const scored = pool
    .map(problem => ({ problem, score: computeProblemScore(problem, { targetRating, desiredDivisions, tags }) }))
    .sort((a, b) => b.score - a.score);

  for (const entry of scored) {
    if (selected.length >= count) break;
    selected.push(entry.problem);
  }

  return selected.slice(0, count);
}

function computeProblemScore(problem, { targetRating, desiredDivisions, tags }) {
  const ratingDistance = Math.abs((problem.rating || targetRating) - targetRating);
  const ratingScore = Math.max(0, 250 - ratingDistance);
  const solvedScore = Math.log10((problem.solvedCount || 0) + 1) * 80;
  const tagScore = tags.length && problem.tags?.some(t => tags.includes(t)) ? 35 : 0;
  const divisionScore = desiredDivisions.size
    ? (desiredDivisions.has(problem.division) ? 40 : -80)
    : (problem.division || 1) * 10;
  const jitter = Math.random() * 12;
  return ratingScore + solvedScore + tagScore + divisionScore + jitter;
}

function normalizeProblemRef(raw) {
  if (!raw) return null;
  const value = String(raw).trim();
  if (!value) return null;

  const cfMatch = value.match(/problem(?:set)?\/problem\/(\d+)\/([A-Za-z0-9]+)/i);
  if (cfMatch) return `${cfMatch[1]}-${cfMatch[2]}`.toLowerCase();
  const contestMatch = value.match(/contest\/(\d+)\/problem\/([A-Za-z0-9]+)/i);
  if (contestMatch) return `${contestMatch[1]}-${contestMatch[2]}`.toLowerCase();

  const rawKeyMatch = value.match(/^(\d+)\s*[-/]\s*([A-Za-z0-9]+)$/);
  if (rawKeyMatch) return `${rawKeyMatch[1]}-${rawKeyMatch[2]}`.toLowerCase();

  return null;
}

// ── Compartir link ─────────────────────────────────────────

export function getTournamentShareLink(tournament) {
  const normalized = normalizeTournamentShape(tournament);
  const payload = {
    id:                normalized.id,
    code:              normalized.code,
    name:              normalized.name,
    creator:           normalized.creator,
    problems:          normalized.problems,
    participants:      normalized.participants,
    submissionsByHandle: normalized.submissionsByHandle,
    createdAt:         normalized.createdAt,
    lastUpdated:       normalized.lastUpdated,
    lastGlobalSyncAt:  normalized.lastGlobalSyncAt
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
  const stored   = loadTournaments().map(normalizeTournamentShape);
  const stateIds = new Set(state.tournaments.map(t => t.id));
  stored.forEach(t => { if (!stateIds.has(t.id)) state.tournaments.push(t); });
}

export function normalizeTournamentShape(tournament) {
  const participants = (tournament.participants || []).map(p => {
    if (typeof p === 'string') {
      return { handle: p, role: 'participant', solvedAt: {}, lastSyncedAt: null };
    }
    return {
      handle: p.handle,
      role: p.role || 'participant',
      solvedAt: p.solvedAt || {},
      lastSyncedAt: p.lastSyncedAt || null
    };
  });

  const creator = tournament.creator;
  const creatorEntry = participants.find(p => p.handle?.toLowerCase() === creator?.toLowerCase());
  if (creatorEntry) creatorEntry.role = 'creator';

  const submissionsByHandle = {};
  for (const [handle, payload] of Object.entries(tournament.submissionsByHandle || {})) {
    submissionsByHandle[handle.toLowerCase()] = {
      updatedAt: payload?.updatedAt || null,
      submissions: Array.isArray(payload?.submissions) ? payload.submissions : []
    };
  }

  return {
    ...tournament,
    participants,
    submissionsByHandle,
    lastUpdated: tournament.lastUpdated || null,
    lastGlobalSyncAt: tournament.lastGlobalSyncAt || null
  };
}

function reduceTournamentSubmissions(submissions, problemKeys) {
  return submissions
    .filter(sub => sub?.problem && problemKeys.has(`${sub.problem.contestId}-${sub.problem.index}`))
    .map(sub => pickSubmissionFields(sub))
    .sort((a, b) => (b.creationTimeSeconds || 0) - (a.creationTimeSeconds || 0))
    .slice(0, 300);
}

async function ensureHandleSubmissions(handle, { forceRefresh = false } = {}) {
  const normalized = handle.toLowerCase();
  const cached = state.submissions[normalized];
  if (!forceRefresh && Array.isArray(cached) && cached.length) return cached;

  const subs = await getCFSubmissions(normalized);
  state.submissions[normalized] = subs;
  saveSubmissions(state.submissions);
  return subs;
}

function deriveSolvedAtForParticipant(submissions, problemKeys) {
  const solvedAt = {};
  for (const sub of submissions || []) {
    if (sub?.verdict !== 'OK' || !sub.problem) continue;
    const key = `${sub.problem.contestId}-${sub.problem.index}`;
    if (!problemKeys.has(key)) continue;
    const ts = (sub.creationTimeSeconds || 0) * 1000;
    if (!solvedAt[key] || ts < solvedAt[key]) solvedAt[key] = ts;
  }
  return solvedAt;
}

function pickSubmissionFields(sub) {
  const output = {};
  for (const key of SUBMISSION_FIELDS) output[key] = sub?.[key];
  return output;
}

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}
