import type { APIRoute } from 'astro';
import { callWebhook } from '../../../lib/n8n';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const REC = /^rec[A-Za-z0-9]{14}$/;

// Actions qui lancent un workflow n8n :
// - tableaux : { annee, tableaux: [1..5] }            → suivi_saison (Google Sheets)
// - contrats : { sejourId, clientId? }                 → contrats_generator (docx + pdf, tout le séjour ou une personne)
// - envoi    : { comptaIds: [...], mode: email|signature } → contrat_envoi (email avec PDF ou signature Yousign)
export const POST: APIRoute = async ({ request, locals }) => {
  const b = await request.json().catch(() => ({}));
  const who = locals.user ? `${locals.user.nom} <${locals.user.email}>` : '';
  try {
    if (b?.type === 'tableaux') {
      const annee = String(b.annee ?? '');
      if (annee && !/^\d{4}$/.test(annee)) return json({ error: 'Année invalide' }, 400);
      const list = (Array.isArray(b.tableaux) ? b.tableaux : []).map(Number).filter((n: number) => n >= 1 && n <= 5);
      if (!list.length) return json({ error: 'Choisissez au moins un tableau' }, 400);
      await callWebhook('suivi-saison', { annee, tableaux: [...new Set(list)].sort().join(',') });
      return json({ ok: true });
    }
    if (b?.type === 'contrats') {
      const sejourId = String(b.sejourId ?? '');
      const clientId = b.clientId ? String(b.clientId) : '';
      if (!REC.test(sejourId) || (clientId && !REC.test(clientId))) return json({ error: 'Séjour ou personne invalide' }, 400);
      await callWebhook('contrats', { sejour: sejourId, ...(clientId ? { client: clientId } : {}), par: who });
      return json({ ok: true });
    }
    if (b?.type === 'envoi') {
      const comptaIds = (Array.isArray(b.comptaIds) ? b.comptaIds : []).map(String).filter((id: string) => REC.test(id));
      const mode = b.mode === 'signature' ? 'signature' : 'email';
      if (!comptaIds.length) return json({ error: 'Aucune ligne Comptabilité sélectionnée' }, 400);
      if (comptaIds.length > 30) return json({ error: '30 contrats maximum par envoi' }, 400);
      const res = await callWebhook('contrat-envoi', {}, { comptaIds, mode, par: who });
      return json({ ok: true, resultats: res?.resultats ?? [] });
    }
    return json({ error: 'Action inconnue' }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Erreur' }, 502);
  }
};
