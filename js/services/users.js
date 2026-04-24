import { state } from '../core/state.js';
import { getCFUser, getCFSubmissions } from './codeforces.js';
import { saveUsers, saveSubmissions } from '../core/storage.js';

export async function addUser(handle) {
  const cfUser = await getCFUser(handle);
  const normalizedHandle = cfUser.handle.toLowerCase();

  if (state.users.some(u => u.handle.toLowerCase() === normalizedHandle)) {
    throw new Error("Usuario ya agregado");
  }

  const newUser = {
    id:        Date.now(),
    handle:    normalizedHandle,
    rating:    cfUser.rating    || 0,
    rank:      cfUser.rank      || "unrated",
    maxRating: cfUser.maxRating || 0
  };


  state.users.push(newUser);

  const subs = await getCFSubmissions(cfUser.handle);
  state.submissions[normalizedHandle] = subs;

  saveUsers(state.users);
  saveSubmissions(state.submissions);
}