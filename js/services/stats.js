export function getSolvedProblems(submissions) {
  const solved = new Set();
  submissions.forEach(sub => {
    if (sub.verdict === "OK" && sub.problem?.contestId && sub.problem?.index) {
      solved.add(`${sub.problem.contestId}-${sub.problem.index}`);
    }
  });
  return solved.size;
}

export function getTagStats(submissions) {
  const stats = {};
  const seen  = new Set();
  submissions.forEach(sub => {
    if (sub.verdict === "OK" && sub.problem?.tags && sub.problem?.contestId && sub.problem?.index) {
      const key = `${sub.problem.contestId}-${sub.problem.index}`;
      if (seen.has(key)) return;
      seen.add(key);
      sub.problem.tags.forEach(tag => {
        stats[tag] = (stats[tag] || 0) + 1;
      });
    }
  });
  return stats;
}

export function getWeakTags(tagStats, limit = 3) {
  const entries = Object.entries(tagStats);
  if (!entries.length) return [];
  entries.sort((a, b) => a[1] - b[1]);
  return entries.slice(0, limit);
}

export function getStrongTags(tagStats, limit = 3) {
  const entries = Object.entries(tagStats);
  entries.sort((a, b) => b[1] - a[1]);
  return entries.slice(0, limit);
}

export function getCurrentStreak(submissions) {
  const days = getSolvedDays(submissions);
  if (!days.length) return 0;
  const today     = dayKey(new Date());
  const yesterday = dayKey(new Date(Date.now() - 86400000));
  if (days[0] !== today && days[0] !== yesterday) return 0;
  let streak = 1;
  for (let i = 1; i < days.length; i++) {
    if (diffDays(days[i - 1], days[i]) === 1) streak++;
    else break;
  }
  return streak;
}

export function getBestStreak(submissions) {
  const days = getSolvedDays(submissions);
  if (!days.length) return 0;
  let best = 1, current = 1;
  for (let i = 1; i < days.length; i++) {
    if (diffDays(days[i - 1], days[i]) === 1) { current++; if (current > best) best = current; }
    else current = 1;
  }
  return best;
}

export function getActivityHeatmap(submissions) {
  const activity = {};
  submissions.forEach(sub => {
    if (sub.creationTimeSeconds) {
      const key = dayKey(new Date(sub.creationTimeSeconds * 1000));
      activity[key] = (activity[key] || 0) + 1;
    }
  });
  return activity;
}

export function getRatingDistribution(submissions) {
  const buckets = {};
  submissions.forEach(sub => {
    if (sub.verdict === "OK" && sub.problem?.rating) {
      const r = sub.problem.rating;
      buckets[r] = (buckets[r] || 0) + 1;
    }
  });
  return Object.entries(buckets)
    .map(([rating, count]) => ({ rating: Number(rating), count }))
    .sort((a, b) => a.rating - b.rating);
}

export function getEfficiency(submissions) {
  if (!submissions.length) return 0;
  const solved = submissions.filter(s => s.verdict === 'OK').length;
  return Math.round((solved / submissions.length) * 100);
}

function dayKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getSolvedDays(submissions) {
  const days = new Set();
  submissions.forEach(sub => {
    if (sub.verdict === "OK" && sub.creationTimeSeconds) {
      days.add(dayKey(new Date(sub.creationTimeSeconds * 1000)));
    }
  });
  return Array.from(days).sort((a, b) => b.localeCompare(a));
}

function diffDays(dayA, dayB) {
  const [ay, am, ad] = dayA.split('-').map(Number);
  const [by, bm, bd] = dayB.split('-').map(Number);
  return Math.round((new Date(ay, am-1, ad) - new Date(by, bm-1, bd)) / 86400000);
}