import type { APIRoute } from 'astro';
import { ADMIN_TABLES, CLIENT_FIELDS, PROSPECT_FIELDS } from '../../../lib/fields';
import { readSchema, readTable } from '../../../lib/n8n';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const pick = (r: Record<string, unknown>, fields: string[]) =>
  Object.fromEntries([['id', r.id], ...fields.filter(f => f in r).map(f => [f, r[f]])]);

// Toutes les données du dashboard en un appel (le navigateur filtre ensuite sans requête)
export const GET: APIRoute = async ({ locals }) => {
  try {
    const [schema, ...lists] = await Promise.all([readSchema(), ...ADMIN_TABLES.map(t => readTable(t))]);
    const tables: Record<string, unknown[]> = {};
    ADMIN_TABLES.forEach((t, i) => {
      tables[t] =
        t === 'Clients' ? lists[i].map(r => pick(r, CLIENT_FIELDS))
          : t === 'Prospects' ? lists[i].map(r => pick(r, PROSPECT_FIELDS))
            : lists[i];
    });
    const choices: Record<string, Record<string, string[]>> = {};
    for (const t of schema.tables) {
      for (const f of t.fields) if (f.choices) (choices[t.name] ??= {})[f.name] = f.choices;
    }
    return json({ tables, choices, user: locals.user, loadedAt: new Date().toISOString() });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Erreur de chargement' }, 502);
  }
};
