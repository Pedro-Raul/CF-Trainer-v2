import { state } from '../core/state.js';
import { getCFUser, getCFSubmissions } from './codeforces.js';
import { saveFriends, saveSubmissions } from '../core/storage.js';

export async function addFriend(handle) {
  const h = handle.toLowerCase();

  if (state.friends.some(f => f.handle.toLowerCase() === h)) {
    throw new Error("Ya es tu amigo");
  }

  if (state.currentUser?.handle.toLowerCase() === h) {
    throw new Error("No puedes agregarte a ti mismo");
  }

  const cfUser = await getCFUser(handle);
  const normalizedHandle = cfUser.handle.toLowerCase();

  const friend = {
    handle:    normalizedHandle,
    rating:    cfUser.rating    || 0,
    rank:      cfUser.rank      || "unrated",
    maxRating: cfUser.maxRating || 0,
    avatar:    cfUser.titlePhoto,
    addedAt:   Date.now()
  };

  state.friends.push(friend);

  // cargar submissions del amigo si no las tenemos
  if (!state.submissions[normalizedHandle]) {
    const subs = await getCFSubmissions(cfUser.handle);
    state.submissions[normalizedHandle] = subs;
    saveSubmissions(state.submissions);
  }

  saveFriends(state.friends);
  return friend;
}

export function removeFriend(handle) {
  state.friends = state.friends.filter(
    f => f.handle.toLowerCase() !== handle.toLowerCase()
  );
  saveFriends(state.friends);
}
