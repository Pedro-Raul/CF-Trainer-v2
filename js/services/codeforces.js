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

  return data.result.problems;
}