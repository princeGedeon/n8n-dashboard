import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { AstroCookies } from 'astro';
import { requireEnv } from './env';

export const COOKIE = 'adm_session';
const DURATION_S = 12 * 3600;

export type SessionUser = { id: string; email: string; nom: string; role: string };

const sign = (payload: string) => createHmac('sha256', requireEnv('SESSION_SECRET')).update(payload).digest('base64url');

export function createSession(cookies: AstroCookies, secure: boolean, user: SessionUser) {
  const payload = Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + DURATION_S, u: user })).toString('base64url');
  cookies.set(COOKIE, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    secure,
    sameSite: 'strict',
    path: '/',
    maxAge: DURATION_S,
  });
}

// Utilisateur de la session, ou null si absente / expirée / falsifiée
export function sessionUser(cookies: AstroCookies): SessionUser | null {
  const value = cookies.get(COOKIE)?.value;
  if (!value) return null;
  const [payload, sig] = value.split('.');
  if (!payload || !sig) return null;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!(Number(data?.exp) > Date.now() / 1000) || !data?.u?.email) return null;
    return data.u as SessionUser;
  } catch {
    return null;
  }
}

export const isValidSession = (cookies: AstroCookies) => sessionUser(cookies) !== null;

export function clearSession(cookies: AstroCookies) {
  cookies.delete(COOKIE, { path: '/' });
}

export const isHttps = (request: Request) =>
  new URL(request.url).protocol === 'https:' || request.headers.get('x-forwarded-proto') === 'https';

// Mots de passe : scrypt salé, format « scrypt$sel$empreinte »
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('base64url');
  return `scrypt$${salt}$${scryptSync(password, salt, 32).toString('base64url')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [algo, salt, hash] = String(stored ?? '').split('$');
  if (algo !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64url');
  const given = scryptSync(password, salt, expected.length);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
