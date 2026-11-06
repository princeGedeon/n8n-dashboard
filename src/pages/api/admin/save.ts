import type { APIRoute } from 'astro';
import { AUDITED, primaryKey, WRITABLE } from '../../../lib/fields';
import { findClientsByEmail, N8nError, pourcentageForYear, writeRecords } from '../../../lib/n8n';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

// Enregistre une ligne : { table, id?, fields, force? }
// id absent → création ; id présent → modification. Seuls les champs autorisés sont transmis.
export const POST: APIRoute = async ({ request, locals }) => {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Requête invalide' }, 400);
  }
  const table = String(body?.table ?? '');
  const allowed = WRITABLE[table];
  if (!allowed) return json({ error: `Table non modifiable : ${table}` }, 400);
  const id = body?.id ? String(body.id) : '';
  if (id && !/^rec[A-Za-z0-9]{14}$/.test(id)) return json({ error: 'Identifiant invalide' }, 400);

  const fields: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body?.fields ?? {})) {
    if (!allowed.includes(k)) continue;
    fields[k] = typeof v === 'string' ? (v.trim() === '' ? null : v.trim()) : v;
  }
  if (!Object.keys(fields).length) return json({ error: 'Aucun champ à enregistrer' }, 400);

  try {
    if (table === 'Clients') {
      if ('Nom' in fields && 'Prenom' in fields) fields['Clé primaire (Nom + Prénom)'] = primaryKey(fields.Nom, fields.Prenom);
      if (!id) {
        if (!fields.Nom && !fields.Prenom) return json({ error: 'Nom ou prénom obligatoire' }, 400);
        if (fields.Email && !body.force) {
          const existing = await findClientsByEmail(String(fields.Email));
          if (existing.length) return json({ error: 'Un client existe déjà avec cet email', existingId: existing[0].id }, 409);
        }
        fields["Date d'entrée (Client)"] ??= new Date().toISOString().slice(0, 10);
      }
    }
    if (table === 'Séjour' && fields['Date de début'] && !fields.Pourcentage_acompte_annee) {
      const pct = await pourcentageForYear(fields['Date de début']);
      if (pct) fields.Pourcentage_acompte_annee = pct;
    }
    if (AUDITED.has(table) && locals.user) {
      const who = `${locals.user.nom} <${locals.user.email}>`;
      fields['Modifié par'] = who;
      fields['Date modification'] = new Date().toISOString();
      if (!id) fields['Créé par'] = who;
    }
    const [record] = await writeRecords(table, id ? 'PATCH' : 'POST', [id ? { id, fields } : { fields }]);
    if (!record?.id) return json({ error: 'Airtable n’a pas renvoyé la ligne enregistrée, actualisez la page' }, 502);
    return json({ record });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Erreur' }, e instanceof N8nError ? e.status : 500);
  }
};
