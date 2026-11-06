// Accès à Airtable via les webhooks n8n (workflow « forms_api »). Côté serveur uniquement.
import { requireEnv } from './env';

export type Rec = { id: string; [field: string]: unknown };

export class N8nError extends Error {
  constructor(message: string, public status = 502) {
    super(message);
  }
}

const base = () => requireEnv('N8N_URL').replace(/\/$/, '') + '/webhook/forms';
const keyHeader = () => ({ 'X-Forms-Key': requireEnv('N8N_FORMS_KEY') });

async function parse(res: Response) {
  const text = await res.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { error: text.slice(0, 200) };
  }
  if (!res.ok) {
    const msg = body?.error?.message || body?.error || `Erreur n8n (${res.status})`;
    throw new N8nError(typeof msg === 'string' ? msg : JSON.stringify(msg), res.status >= 500 ? 502 : 400);
  }
  return body;
}

export async function readTable(table: string, formula = ''): Promise<Rec[]> {
  const url = `${base()}/read?table=${encodeURIComponent(table)}${formula ? `&formula=${encodeURIComponent(formula)}` : ''}`;
  const body = await parse(await fetch(url, { headers: keyHeader() }));
  return (body?.records ?? []) as Rec[];
}

// Le vrai id Airtable passe en dernier : certaines tables ont un champ formule « id » qui l'écraserait
const flatten = (r: { id: string; fields?: Record<string, unknown> }): Rec => ({ ...(r.fields ?? {}), id: r.id });

export async function writeRecords(
  table: string,
  method: 'POST' | 'PATCH',
  records: { id?: string; fields: Record<string, unknown> }[],
): Promise<Rec[]> {
  const out: Rec[] = [];
  for (let i = 0; i < records.length; i += 10) {
    const body = await parse(
      await fetch(`${base()}/write`, {
        method: 'POST',
        headers: { ...keyHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ table, method, records: records.slice(i, i + 10) }),
      }),
    );
    out.push(...(body?.records ?? []).map(flatten));
  }
  return out;
}

export async function readSchema(): Promise<{ tables: { name: string; fields: { name: string; type: string; choices?: string[] }[] }[] }> {
  return parse(await fetch(`${base()}/schema`, { headers: keyHeader() }));
}

export type User = { id: string; email: string; nom: string; role: string };

// Compte de la table Utilisateurs (lecture côté serveur uniquement : contient le mot de passe chiffré)
export async function findUserByEmail(email: string): Promise<Rec | undefined> {
  const e = normEmail(email);
  if (!e) return undefined;
  const rows = await readTable('Utilisateurs', `LOWER(TRIM({Email}))=${q(e)}`);
  return rows[0];
}

// Email de notification (Gmail d'Aude par défaut)
export async function notify(subject: string, html: string, to?: string): Promise<void> {
  await parse(
    await fetch(`${base()}/notify`, {
      method: 'POST',
      headers: { ...keyHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ subject, html, to }),
    }),
  );
}

// Appelle un webhook n8n protégé par la clé serveur (contrats, tableaux, envoi des contrats)
export async function callWebhook(pathName: string, params: Record<string, string>, body?: unknown): Promise<any> {
  const url = `${requireEnv('N8N_URL').replace(/\/$/, '')}/webhook/${pathName}?${new URLSearchParams(params)}`;
  return parse(
    await fetch(url, body === undefined
      ? { headers: keyHeader() }
      : { method: 'POST', headers: { ...keyHeader(), 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  );
}

// Échappe une valeur texte pour une formule Airtable entre apostrophes
export const q = (v: string) => `'${v.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

export const normEmail = (v: unknown) => String(v ?? '').trim().toLowerCase();

export async function findClientsByEmail(email: string): Promise<Rec[]> {
  const e = normEmail(email);
  if (!e) return [];
  return readTable('Clients', `OR(LOWER(TRIM({Email}))=${q(e)},LOWER(TRIM({AutreEmail}))=${q(e)})`);
}

// Lien vers les pourcentages d'acompte de l'année du séjour (nécessaire aux montants calculés)
export async function pourcentageForYear(dateDebut: unknown): Promise<string[] | undefined> {
  const year = String(dateDebut ?? '').slice(0, 4);
  if (!/^\d{4}$/.test(year)) return undefined;
  const rows = await readTable('Pourcentage_Annee', `{Annee}=${q(year)}`);
  return rows[0] ? [rows[0].id] : undefined;
}
