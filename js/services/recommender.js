export function getRecommendations(user, submissions, problems, weakTags) {
  return getRecommendationsByMode(user, submissions, problems, weakTags, 'weak');
}

/**
 * mode: 'weak'  → tags donde el usuario es débil
 *       'level' → escalonado: nivel actual + un step arriba
 *       'any'   → tags que nunca ha tocado
 */
export function getRecommendationsByMode(user, submissions, problems, weakTags, mode) {
  const solved = new Set(
    submissions
      .filter(s => s.verdict === 'OK' && s.problem)
      .map(s => `${s.problem.contestId}-${s.problem.index}`)
  );

  const rating = user.rating || 1000;

  if (mode === 'weak') {
    const targetTags = weakTags.map(([tag]) => tag);
    const min = rating - 100;
    const max = rating + 400;

    let pool = problems.filter(p => {
      const key = `${p.contestId}-${p.index}`;
      return (
        !solved.has(key) &&
        p.rating >= min && p.rating <= max &&
        p.tags?.some(t => targetTags.includes(t))
      );
    });

    // fallback si no hay suficientes por tag
    if (pool.length < 10) {
      const extra = problems.filter(p => {
        const key = `${p.contestId}-${p.index}`;
        return (
          !solved.has(key) &&
          p.rating >= min && p.rating <= max &&
          !pool.includes(p)
        );
      });
      pool = [...pool, ...extra];
    }

    return shuffle(pool).slice(0, 10);
  }

  if (mode === 'level') {
    const step  = 200;
    const band1 = problems.filter(p => {
      const key = `${p.contestId}-${p.index}`;
      return !solved.has(key) && p.rating >= rating && p.rating < rating + step;
    });
    const band2 = problems.filter(p => {
      const key = `${p.contestId}-${p.index}`;
      return !solved.has(key) && p.rating >= rating + step && p.rating < rating + step * 2;
    });
    return [...shuffle(band1).slice(0, 5), ...shuffle(band2).slice(0, 5)];
  }

  if (mode === 'any') {
    const touchedTags = new Set(
      submissions
        .filter(s => s.verdict === 'OK' && s.problem?.tags)
        .flatMap(s => s.problem.tags)
    );
    const min = Math.max(800, rating - 200);
    const max = rating + 300;

    const pool = problems.filter(p => {
      const key = `${p.contestId}-${p.index}`;
      return (
        !solved.has(key) &&
        p.rating >= min && p.rating <= max &&
        p.tags?.some(t => !touchedTags.has(t))
      );
    });
    return shuffle(pool).slice(0, 10);
  }

  return [];
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}