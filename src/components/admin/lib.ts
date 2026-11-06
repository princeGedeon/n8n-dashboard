// Types et fonctions communes du dashboard (navigateur)
export type Rec = { id: string; [field: string]: any };
export type Tables = Record<string, Rec[]>;
export type Choices = Record<string, Record<string, string[]>>;
export type Data = { tables: Tables; choices: Choices; loadedAt: string };

export class ApiError extends Error {
  constructor(message: string, public status: number, public data: any) {
    super(message);
  }
}

export async function api<T = any>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, body === undefined
    ? { headers: { Accept: 'application/json' } }
    : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    window.location.href = '/admin/login';
    throw new ApiError('Session expirée', 401, data);
  }
  if (!res.ok) throw new ApiError(data?.error || `Erreur ${res.status}`, res.status, data);
  return data as T;
}

export const saveRecord = (table: string, fields: Record<string, unknown>, id?: string, force = false) =>
  api<{ record: Rec }>('/api/admin/save', { table, id, fields, force }).then(r => r.record);

export const ids = (v: unknown): string[] => (Array.isArray(v) ? v.filter(x => typeof x === 'string') : []);
export const first = (v: unknown) => ids(v)[0];
export const txt = (v: unknown) => (v === null || v === undefined ? '' : Array.isArray(v) ? v.join(', ') : String(v));
export const num = (v: unknown) => (typeof v === 'number' ? v : Array.isArray(v) && typeof v[0] === 'number' ? v[0] : Number(v) || 0);
export const norm = (v: unknown) => txt(v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
export const isActive = (r: Rec) => r.Statut !== 'Inactive';
export const today = () => new Date().toISOString().slice(0, 10);

export const clientName = (c?: Rec) =>
  c ? [txt(c.Prenom), txt(c.Nom).toUpperCase()].filter(Boolean).join(' ') || txt(c['Clé primaire (Nom + Prénom)']) || '(sans nom)' : '(client inconnu)';

export const frDate = (iso: unknown) => {
  const s = txt(iso).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : '—';
};
export const euro = (n: number) => n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

export type Role = 'Chef de groupe' | 'Participant' | 'Accompagnant';
export function people(s: Rec): { id: string; role: Role }[] {
  const out: { id: string; role: Role }[] = [];
  const add = (id: string, role: Role) => !out.some(p => p.id === id) && out.push({ id, role });
  ids(s['Chef de groupe']).forEach(id => add(id, 'Chef de groupe'));
  ids(s['Participants (Séjour)']).forEach(id => add(id, 'Participant'));
  ids(s['Accompagnants (Séjour)']).forEach(id => add(id, 'Accompagnant'));
  return out;
}

// Deux séjours se chevauchent (le jour de départ de l'un peut être le jour d'arrivée de l'autre)
export const overlaps = (a: Rec, b: Rec) =>
  !!a['Date de début'] && !!b['Date de début'] &&
  a['Date de début'] < (b['Date de fin'] || b['Date de début']) && b['Date de début'] < (a['Date de fin'] || a['Date de début']);

export const byId = (list: Rec[] = []) => Object.fromEntries(list.map(r => [r.id, r])) as Record<string, Rec>;

// Associations : table, champ client, champ ressource, champ date
export const ASSOC = {
  logement: { table: 'Association_Logement', client: 'Clients', res: 'Logement', date: 'Date de création' },
  guide: { table: 'Association_Guides', client: 'Client', res: 'Guide', date: "Date d'association" },
  bateau: { table: 'Association_bateau', client: 'Clients', res: 'Bateau', date: 'Date de création' },
} as const;
export type AssocKind = keyof typeof ASSOC;

export const findAssoc = (tables: Tables, kind: AssocKind, sejourId: string, clientId: string) => {
  const a = ASSOC[kind];
  return (tables[a.table] ?? []).find(r => isActive(r) && ids(r.ID_Séjour).includes(sejourId) && ids(r[a.client]).includes(clientId));
};

export const findCompta = (tables: Tables, sejourId: string, clientId: string) =>
  (tables['Comptabilité'] ?? []).find(r => ids(r.ID_Séjour).includes(sejourId) && ids(r.Client).includes(clientId));

// Matériel : plusieurs lignes Association_Materiel possibles par client (une par article)
export const MAT = { table: 'Association_Materiel', client: 'Clients ( Séjour)', res: 'Materiel', date: "Date d'association" } as const;
export const findMateriel = (tables: Tables, sejourId: string, clientId: string) =>
  (tables[MAT.table] ?? []).filter(r => isActive(r) && ids(r.ID_Séjour).includes(sejourId) && ids(r[MAT.client]).includes(clientId));
export const materielLabel = (m?: Rec) =>
  m ? txt(m.id_materiel) || [txt(m.Nom), txt(m.Marque), txt(m['Modèle'])].filter(Boolean).join(' ') || txt(m.Id) || '(matériel)' : '(matériel supprimé)';

// Crée une attribution (chambre, guide, bateau ou matériel) pour un client d'un séjour
export function createAssoc(kind: AssocKind | 'materiel', sejourId: string, clientId: string, resourceId: string) {
  const a = kind === 'materiel' ? MAT : ASSOC[kind];
  return saveRecord(a.table, { ID_Séjour: [sejourId], [a.client]: [clientId], [a.res]: [resourceId], Statut: 'Active', [a.date]: today() });
}

// TotalAcompte = acomptes dont la date de versement est renseignée
export const totalAcompte = (c?: Rec) =>
  c ? (c['Date_acompte 1'] ? num(c.Montant_acompte_1) : 0) + (c['Date_acompte 2'] ? num(c.Montant_acompte_2) : 0) : 0;
