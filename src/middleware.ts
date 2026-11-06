import { defineMiddleware } from 'astro:middleware';
import { sessionUser } from './lib/session';

const PUBLIC_ADMIN = ['/admin/login', '/api/admin/login'];

// Refuse les requêtes d'écriture venant d'un autre site (protection CSRF).
// Compare uniquement l'hôte : derrière un proxy HTTPS, le serveur Node voit http.
function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host');
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export const onRequest = defineMiddleware(async (ctx, next) => {
  const { pathname } = ctx.url;
  const isAdminArea = pathname.startsWith('/admin') || pathname.startsWith('/api/admin');

  if (ctx.request.method !== 'GET' && ctx.request.method !== 'HEAD' && !sameOrigin(ctx.request)) {
    return new Response(JSON.stringify({ error: 'Origine refusée' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
  }

  if (isAdminArea && !PUBLIC_ADMIN.includes(pathname)) {
    const user = sessionUser(ctx.cookies);
    if (!user) {
      if (pathname.startsWith('/api/')) {
        return new Response(JSON.stringify({ error: 'Session expirée, reconnectez-vous' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
      }
      return ctx.redirect('/admin/login');
    }
    ctx.locals.user = user;
  }

  const res = await next();
  res.headers.set('X-Content-Type-Options', 'nosniff');
  res.headers.set('X-Frame-Options', 'DENY');
  res.headers.set('Referrer-Policy', 'same-origin');
  if (isAdminArea) {
    res.headers.set('X-Robots-Tag', 'noindex, nofollow');
    res.headers.set('Cache-Control', 'no-store');
  }
  return res;
});
