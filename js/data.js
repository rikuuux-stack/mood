/**
 * Accès aux données. En mode 'mock', tout est simulé localement (rien ne quitte le navigateur).
 * Le mode 'live' (Supabase) sera branché à l'étape suivante.
 */
import { CONFIG } from './config.js?v=8e29dd9ad2';

const wait = ms => new Promise(r => setTimeout(r, ms));

export async function fetchPosts() {
  if (CONFIG.mode === 'mock') {
    const { MOCK_POSTS } = await import('./mock.js?v=75d61f5f8f');
    return MOCK_POSTS;
  }
  throw new Error('mode live : pas encore branché');
}

export async function submitPost(_post) {
  if (CONFIG.mode === 'mock') { await wait(600); return { ok: true }; }
  throw new Error('mode live : pas encore branché');
}

export async function reportPost(_id, _reason, _captcha) {
  if (CONFIG.mode === 'mock') { await wait(400); return { ok: true }; }
  throw new Error('mode live : pas encore branché');
}
