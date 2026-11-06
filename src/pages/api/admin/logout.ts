import type { APIRoute } from 'astro';
import { clearSession } from '../../../lib/session';

export const POST: APIRoute = async ({ cookies, redirect }) => {
  clearSession(cookies);
  return redirect('/admin/login', 303);
};
