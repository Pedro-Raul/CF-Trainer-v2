import { getCFUser, getCFSubmissions } from './codeforces.js';
import { state } from '../core/state.js';
import { saveSession, saveSubmissions, loadSubmissions } from '../core/storage.js';

export async function login(name, handle) {
  const cfUser = await getCFUser(handle);

  const user = {
    name,
    handle:    cfUser.handle.toLowerCase(),
    avatar:    cfUser.titlePhoto,
    rating:    cfUser.rating || 0
  };

  state.currentUser = user;

  // cargar submissions del usuario si no las tiene
  const subs = await getCFSubmissions(cfUser.handle);
  state.submissions[user.handle] = subs;
  saveSubmissions(state.submissions);

  saveSession(user);

  return user;
}