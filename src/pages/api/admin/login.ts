import type { APIRoute } from 'astro';
import { checkAdminPassword } from '../../../lib/n8n';
import { clientIp, rateLimit } from '../../../lib/ratelimit';
import { createSession, isHttps } from '../../../lib/session';

export const POST: APIRoute = async ({ request, cookies, redirect, clientAddress }) => {
  const ip = clientIp(request, clientAddress);
  if (!rateLimit(`login:${ip}`, 5, 15 * 60_000)) return redirect('/admin/login?e=2', 303);
  const form = await request.formData();
  const password = String(form.get('password') ?? '');
  if (!password || password.length > 200) return redirect('/admin/login?e=1', 303);
  let ok = false;
  try {
    ok = await checkAdminPassword(password);
  } catch {
    return redirect('/admin/login?e=3', 303);
  }
  if (!ok) return redirect('/admin/login?e=1', 303);
  createSession(cookies, isHttps(request));
  return redirect('/admin', 303);
};
