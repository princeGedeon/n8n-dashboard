import type { APIRoute } from 'astro';
import { env } from '../../lib/env';
import { primaryKey } from '../../lib/fields';
import { findClientsByEmail, pourcentageForYear, writeRecords, type Rec } from '../../lib/n8n';
import { clientIp, rateLimit } from '../../lib/ratelimit';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const s = (v: unknown, max = 200) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
const long = (v: unknown, max = 2000) => String(v ?? '').replace(/[\u0000-\u0008\u000b-\u001f]/g, '').trim().slice(0, max);

type Person = {
  prenom: string; nom: string; email: string; telephone: string; regime: string; taille: string; moucheur: boolean;
  adresse: string; codePostal: string; ville: string; pays: string;
};

function readPerson(p: any): Person {
  return {
    prenom: s(p?.prenom, 80), nom: s(p?.nom, 80), email: s(p?.email, 120).toLowerCase(), telephone: s(p?.telephone, 40),
    regime: s(p?.regime, 200), taille: s(p?.taille, 40), moucheur: p?.moucheur === true,
    adresse: s(p?.adresse), codePostal: s(p?.codePostal, 20), ville: s(p?.ville, 80), pays: s(p?.pays, 80),
  };
}

async function verifyTurnstile(token: string, ip: string): Promise<boolean> {
  const secret = env('TURNSTILE_SECRET_KEY');
  if (!secret) return true; // captcha désactivé
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body: new URLSearchParams({ secret, response: token, remoteip: ip }),
  });
  const data = await res.json().catch(() => ({}));
  return data?.success === true;
}

// Trouve le client par email, sinon le crée. Un client existant n'est jamais modifié :
// les informations transmises sont recopiées dans les remarques du séjour pour vérification.
async function findOrCreate(p: Person, source: string): Promise<{ id: string; existing: boolean }> {
  if (p.email) {
    const found = await findClientsByEmail(p.email);
    if (found.length) return { id: found[0].id, existing: true };
  }
  const fields: Record<string, unknown> = {
    'Clé primaire (Nom + Prénom)': primaryKey(p.nom, p.prenom),
    Nom: p.nom, Prenom: p.prenom, Email: p.email || null, 'Numéro de téléphone': p.telephone || null,
    'Régime alimentaire': p.regime || null, Taille: p.taille || null, Moucheur: p.moucheur,
    Source: source, "Date d'entrée (Client)": new Date().toISOString().slice(0, 10),
  };
  Object.assign(fields, { 'Address Line 1': p.adresse || null, 'Postal Code': p.codePostal || null, City: p.ville || null, Country: p.pays || null });
  const [rec] = await writeRecords('Clients', 'POST', [{ fields }]);
  return { id: (rec as Rec).id, existing: false };
}

const describe = (p: Person) =>
  [`${p.prenom} ${p.nom}`, p.email, p.telephone, p.regime && `régime : ${p.regime}`, p.taille && `taille : ${p.taille}`,
    p.moucheur && 'moucheur', p.adresse && `adresse : ${[p.adresse, p.codePostal, p.ville, p.pays].filter(Boolean).join(' ')}`]
    .filter(Boolean).join(' · ');

export const POST: APIRoute = async ({ request, clientAddress }) => {
  const ip = clientIp(request, clientAddress);
  if (!rateLimit(`client:${ip}`, 5, 60 * 60_000)) return json({ error: 'Trop de demandes, réessayez plus tard.' }, 429);

  let b: any;
  try {
    b = await request.json();
  } catch {
    return json({ error: 'Requête invalide' }, 400);
  }
  // Champ piège invisible : rempli uniquement par les robots → réponse neutre, rien n'est enregistré
  if (s(b?.website)) return json({ ok: true });
  if (!(await verifyTurnstile(s(b?.turnstileToken, 4000), ip))) return json({ error: 'Vérification anti-robot échouée, réessayez.' }, 400);

  const main = readPerson(b?.client);
  const sejour = {
    debut: s(b?.sejour?.debut, 10), fin: s(b?.sejour?.fin, 10), formule: s(b?.sejour?.formule, 10),
    nbPecheurs: Math.max(1, Math.min(30, Number(b?.sejour?.nbPecheurs) || 1)),
    attentes: long(b?.sejour?.attentes), vols: long(b?.sejour?.vols, 1000),
    nbAccompagnants: Math.max(0, Math.min(30, Number(b?.sejour?.nbAccompagnants) || 0)),
  };

  const errors: string[] = [];
  if (!main.prenom || !main.nom) errors.push('Prénom et nom obligatoires');
  if (!EMAIL.test(main.email)) errors.push('Email invalide');
  if (!main.telephone) errors.push('Téléphone obligatoire');
  if (!DATE.test(sejour.debut) || !DATE.test(sejour.fin) || sejour.fin < sejour.debut) errors.push('Dates de séjour invalides');
  if (sejour.debut && sejour.debut < new Date().toISOString().slice(0, 10)) errors.push('La date d’arrivée est passée');
  if (b?.consent !== true) errors.push('Merci d’accepter l’utilisation de vos données');
  if (errors.length) return json({ error: errors.join('. ') + '.' }, 400);

  try {
    // Seul le client est créé ; les autres membres du groupe sont ajoutés par l'admin
    const chef = await findOrCreate(main, 'Formulaire web');
    const notes: string[] = [`Demande reçue via le formulaire web le ${new Date().toLocaleDateString('fr-FR')}.`];
    if (chef.existing) notes.push(`Client déjà connu — infos saisies à vérifier : ${describe(main)}`);
    notes.push(`Groupe annoncé : ${sejour.nbPecheurs} pêcheur(s)${sejour.nbAccompagnants ? ` + ${sejour.nbAccompagnants} accompagnant(s)` : ''} — participants à ajouter par l'admin.`);
    if (sejour.vols) notes.push(`Vols : ${sejour.vols}`);

    const fields: Record<string, unknown> = {
      'Date de début': sejour.debut,
      'Date de fin': sejour.fin,
      Status: 'Attente',
      'Chef de groupe': [chef.id],
      'Nombre de pêcheurs': sejour.nbPecheurs,
      'Brief attentes': sejour.attentes || null,
      Remarques: notes.join('\n'),
    };
    if (sejour.formule) fields.Formule = sejour.formule;
    const pct = await pourcentageForYear(sejour.debut);
    if (pct) fields.Pourcentage_acompte_annee = pct;
    await writeRecords('Séjour', 'POST', [{ fields }]);
    return json({ ok: true });
  } catch (e) {
    console.error('Formulaire client :', e instanceof Error ? e.message : e);
    return json({ error: 'Le service est momentanément indisponible. Réessayez dans quelques minutes.' }, 502);
  }
};
