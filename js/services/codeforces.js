export async function getCFUser(handle) {
  try {
    const res = await fetch(`https://codeforces.com/api/user.info?handles=${handle}`);
    const data = await res.json();

    if (data.status !== "OK") {
      throw new Error("Usuario no encontrado");
    }

    return data.result[0];

  } catch (err) {
    console.error(err);
    throw err;
  }
}

export async function getCFSubmissions(handle) {
  const res = await fetch(`https://codeforces.com/api/user.status?handle=${handle}`);
  const data = await res.json();

  if (data.status !== "OK") {
    throw new Error("Error obteniendo submissions");
  }
  return data.result;
}

export async function getProblemset() {
  const res = await fetch("https://codeforces.com/api/problemset.problems");
  const data = await res.json();

  if (data.status !== "OK") {
    throw new Error("Error cargando problemas");
  }

  const problems = data.result.problems || [];
  const stats = data.result.problemStatistics || [];
  const solvedByProblem = new Map(
    stats.map(item => [`${item.contestId}-${item.index}`, item.solvedCount || 0])
  );

  let contestDivMap = new Map();
  try {
    contestDivMap = await getContestDivisionMap();
  } catch (err) {
    console.warn("No se pudieron cargar divisiones de concursos:", err);
  }
  return problems.map(problem => ({
    ...problem,
    solvedCount: solvedByProblem.get(`${problem.contestId}-${problem.index}`) || 0,
    division: contestDivMap.get(problem.contestId) || null
  }));
}

async function getContestDivisionMap() {
  const res = await fetch("https://codeforces.com/api/contest.list");
  const data = await res.json();
  if (data.status !== "OK") {
    throw new Error("Error cargando divisiones de concursos");
  }

  const divMap = new Map();
  for (const contest of data.result || []) {
    divMap.set(contest.id, inferDivisionFromContestName(contest.name));
  }
  return divMap;
}

function inferDivisionFromContestName(name = "") {
  // Captura casos como "Div. 2", "Div. 1 + Div. 2", etc.
  const found = [...name.matchAll(/Div\.\s*([1-4])/gi)].map(match => Number(match[1]));
  if (!found.length) return null;
  // Requisito del producto: a mayor Div, mayor dificultad.
  return Math.max(...found);
}
