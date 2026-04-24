export function renderLeaderboard(users) {
  if (!users.length) {
    return `<p>No hay usuarios aún</p>`;
  }

  return `
    <table border="1" cellpadding="8">
      <tr>
        <th>Handle</th>
        <th>Rating</th>
        <th>Rank</th>
      </tr>
      ${users.map(u => `
        <tr>
          <td>${u.handle}</td>
          <td>${u.rating}</td>
          <td>${u.rank}</td>
        </tr>
      `).join('')}
    </table>
  `;
}