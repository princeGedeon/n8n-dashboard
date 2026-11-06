import { createHmac, timingSafeEqual } from 'node:crypto';
import type { AstroCookies } from 'astro';
import { requireEnv } from './env';

export const COOKIE = 'adm_session';
const DURATION_S = 12 * 3600;

const sign = (payload: string) => createHmac('sha256', requireEnv('SESSION_SECRET')).update(payload).digest('base64url');

export function createSession(cookies: AstroCookies, secure: boolean) {
  const payload = String(Math.floor(Date.now() / 1000) + DURATION_S);
  cookies.set(COOKIE, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    secure,
    sameSite: 'strict',
    path: '/',
    maxAge: DURATION_S,
  });
}

export function isValidSession(cookies: AstroCookies): boolean {
  const value = cookies.get(COOKIE)?.value;
  if (!value) return false;
  const [payload, sig] = value.split('.');
  if (!payload || !sig) return false;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return false;
  return Number(payload) > Date.now() / 1000;
}

export function clearSession(cookies: AstroCookies) {
  cookies.delete(COOKIE, { path: '/' });
}

export const isHttps = (request: Request) =>
  new URL(request.url).protocol === 'https:' || request.headers.get('x-forwarded-proto') === 'https';
