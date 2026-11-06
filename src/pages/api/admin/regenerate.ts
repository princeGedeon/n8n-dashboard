import type { APIRoute } from 'astro';
import { regenerateExcel } from '../../../lib/n8n';

export const POST: APIRoute = async ({ request }) => {
  const body = await request.json().catch(() => ({}));
  const annee = String(body?.annee ?? '');
  if (annee && !/^\d{4}$/.test(annee)) {
    return new Response(JSON.stringify({ error: 'Année invalide' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }
  try {
    await regenerateExcel(annee);
    return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'Erreur' }), { status: 502, headers: { 'Content-Type': 'application/json' } });
  }
};
