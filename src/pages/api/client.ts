import type { APIRoute } from 'astro';
import { env } from '../../lib/env';
import { primaryKey } from '../../lib/fields';
import { notify, q, readTable, writeRecords, type Rec } from '../../lib/n8n';
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

// Contact : retrouvé par email, sinon créé. Un contact existant n'est jamais modifié
// (les informations saisies sont de toute façon recopiées dans le Prospect).
async function findOrCreateContact(p: Person, source: string, extra: Record<string, unknown>): Promise<{ id: string; existing: boolean }> {
  if (p.email) {
    const found = await readTable('Contact', `OR(LOWER(TRIM({Email}))=${q(p.email)},LOWER(TRIM({AutreEmail}))=${q(p.email)})`);
    if (found.length) return { id: found[0].id, existing: true };
  }
  const [rec] = await writeRecords('Contact', 'POST', [{ fields: { ...personFields(p), ...extra, Source: source, 'Créé par': 'Formulaire web' } }]);
  return { id: (rec as Rec).id, existing: false };
}

const personFields = (p: Person) => ({
  Nom: p.nom, Prenom: p.prenom, Email: p.email || null, 'Numéro de téléphone': p.telephone || null,
  'Régime alimentaire': p.regime || null, Taille: p.taille || null, Moucheur: p.moucheur,
  'Address Line 1': p.adresse || null, 'Postal Code': p.codePostal || null, City: p.ville || null, Country: p.pays || null,
});

const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const frDate = (iso: string) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '?');

function notificationHtml(p: Person, s: { debut: string; fin: string; formule: string; nbPecheurs: number; nbAccompagnants: number; attentes: string; vols: string }, source: string, contactExisting: boolean, link: string) {
  const rows: [string, string][] = [
    ['Nom', `${p.prenom} ${p.nom.toUpperCase()}`], ['Email', p.email], ['Téléphone', p.telephone],
    ['Adresse', [p.adresse, p.codePostal, p.ville, p.pays].filter(Boolean).join(' ')],
    ['Séjour souhaité', `du ${frDate(s.debut)} au ${frDate(s.fin)}`], ['Formule', s.formule || 'à définir'],
    ['Groupe', `${s.nbPecheurs} pêcheur(s)${s.nbAccompagnants ? ` + ${s.nbAccompagnants} accompagnant(s)` : ''}`],
    ['Régime / taille', [p.regime, p.taille].filter(Boolean).join(' · ')], ['Moucheur', p.moucheur ? 'oui' : 'non'],
    ['Attentes', s.attentes], ['Vols', s.vols], ['Source', source],
    ['Contact', contactExisting ? 'déjà connu (fiche non modifiée)' : 'nouveau contact créé'],
  ];
  return `<div style="font-family:Arial,sans-serif;font-size:14px;color:#1e293b">
<h2 style="color:#075985">Nouvelle demande de séjour</h2>
<table cellpadding="6" style="border-collapse:collapse">${rows.filter(([, v]) => v).map(([k, v]) => `<tr><td style="color:#64748b;vertical-align:top">${esc(k)}</td><td style="white-space:pre-wrap">${esc(v)}</td></tr>`).join('')}</table>
<p>Le prospect est dans Airtable (statut « Nouveau »).${link ? ` <a href="${esc(link)}">Ouvrir l’espace admin</a> › Prospects pour le convertir en séjour.` : ''}</p></div>`;
}

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
    source: s(b?.sejour?.source, 80),
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
    // Le formulaire ne crée plus de séjour : Contact (+ source) puis Prospect, et Aude est prévenue par email.
    // Le séjour est créé ensuite depuis l'espace admin (Prospects › Convertir en séjour).
    const source = ['Formulaire web', sejour.source].filter(Boolean).join(' · ');
    const periode = `${frDate(sejour.debut)} → ${frDate(sejour.fin)}`;
    const common = {
      'Formule du séjour': sejour.formule || null,
      'Nombre de pêcheurs': sejour.nbPecheurs,
      nbreAccompagnant: sejour.nbAccompagnants,
      'Période souhaitée': periode,
    };
    const contact = await findOrCreateContact(main, source, common);
    await writeRecords('Prospects', 'POST', [{
      fields: {
        'Clé primaire (Nom + Prénom)': primaryKey(main.nom, main.prenom),
        ...personFields(main),
        ...common,
        Source: source,
        'Date début souhaitée': sejour.debut,
        'Date fin souhaitée': sejour.fin,
        'Statut prospect': 'Nouveau',
        'Brief attentes': sejour.attentes || null,
        Vols: sejour.vols || null,
        'Contact ID': contact.id,
        "Date d'entrée (Prospect)": new Date().toISOString().slice(0, 10),
        'Créé par': 'Formulaire web',
      },
    }]);
    const adminUrl = env('PUBLIC_URL') ? `${env('PUBLIC_URL')!.replace(/\/$/, '')}/admin` : new URL('/admin', request.url).toString();
    try {
      await notify(
        `Nouvelle demande : ${main.prenom} ${main.nom.toUpperCase()} · ${periode} · ${sejour.nbPecheurs} pêcheur(s)`,
        notificationHtml(main, sejour, source, contact.existing, adminUrl),
      );
    } catch (e) {
      // La demande est enregistrée : un échec d'email ne doit pas la faire refuser
      console.error('Notification prospect :', e instanceof Error ? e.message : e);
    }
    return json({ ok: true });
  } catch (e) {
    console.error('Formulaire client :', e instanceof Error ? e.message : e);
    return json({ error: 'Le service est momentanément indisponible. Réessayez dans quelques minutes.' }, 502);
  }
};
