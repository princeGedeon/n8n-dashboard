import type { APIRoute } from 'astro';
import { findUserByEmail, writeRecords } from '../../../lib/n8n';
import { clearFailures, clientIp, isBlocked, recordFailure } from '../../../lib/ratelimit';
import { createSession, hashPassword, isHttps, verifyPassword } from '../../../lib/session';

const WINDOW = 15 * 60_000;

// Connexion par email + mot de passe (table Airtable « Utilisateurs »).
// « Nouveau mot de passe » (saisi en clair dans Airtable par le super admin) est accepté une fois,
// puis chiffré dans « Mot de passe (chiffré) » et effacé.
// Codes d'erreur : 1 identifiants incorrects · 2 trop d'essais · 3 service indisponible · 4 compte désactivé
export const POST: APIRoute = async ({ request, cookies, redirect, clientAddress }) => {
  const key = `login:${clientIp(request, clientAddress)}`;
  if (isBlocked(key, 8, WINDOW)) return redirect('/admin/login?e=2', 303);
  const form = await request.formData();
  const email = String(form.get('email') ?? '').trim().toLowerCase();
  const password = String(form.get('password') ?? '');
  const fail = (code: number) => {
    if (code === 1) recordFailure(key);
    return redirect(`/admin/login?e=${code}&email=${encodeURIComponent(email)}`, 303);
  };
  if (!email || !password || password.length > 200) return fail(1);

  let user;
  try {
    user = await findUserByEmail(email);
  } catch (e) {
    console.error('Connexion : lecture Utilisateurs impossible :', e instanceof Error ? e.message : e);
    return fail(3);
  }
  if (!user) return fail(1);

  const stored = String(user['Mot de passe (chiffré)'] ?? '');
  const initial = String(user['Nouveau mot de passe'] ?? '').trim();
  const okInitial = !!initial && password === initial;
  if (!okInitial && !verifyPassword(password, stored)) return fail(1);
  if (user.Actif !== true) return fail(4);

  const fields: Record<string, unknown> = { 'Dernière connexion': new Date().toISOString() };
  if (okInitial) Object.assign(fields, { 'Mot de passe (chiffré)': hashPassword(password), 'Nouveau mot de passe': null });
  try {
    await writeRecords('Utilisateurs', 'PATCH', [{ id: user.id, fields }]);
  } catch (e) {
    console.error('Connexion : mise à jour Utilisateurs impossible :', e instanceof Error ? e.message : e);
    if (okInitial) return fail(3); // sinon le mot de passe ne serait jamais chiffré
  }

  clearFailures(key);
  createSession(cookies, isHttps(request), {
    id: user.id,
    email,
    nom: String(user.Nom ?? '').trim() || email,
    role: String(user['Rôle'] ?? 'staff'),
  });
  return redirect('/admin', 303);
};
