import { useMemo, useState } from 'react';
import { ApiError, frDate, norm, saveRecord, txt, type Data, type Rec } from './lib';
import { Pill } from './ui';

const STATUTS = ['Nouveau', 'En cours', 'Converti', 'Perdu'];
const TONE: Record<string, 'ok' | 'warn' | 'bad' | 'info'> = { Nouveau: 'warn', 'En cours': 'info', Converti: 'ok', Perdu: 'bad' };

// Demandes reçues par le formulaire client : on les traite ici puis on les convertit en séjour
export function ProspectsView({ data, onSaved, openSejour }: {
  data: Data; onSaved: (table: string, r: Rec) => void; openSejour: (id: string | null, preset?: Rec) => void;
}) {
  const [filter, setFilter] = useState('actifs');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const me = data.user?.nom ?? '';

  const list = useMemo(() => {
    const q = norm(query);
    return [...(data.tables.Prospects ?? [])]
      .filter(p => {
        const st = txt(p['Statut prospect']);
        if (filter === 'actifs' && (st === 'Converti' || st === 'Perdu')) return false;
        if (filter !== 'actifs' && filter !== 'tous' && st !== filter) return false;
        return !q || norm([p.Nom, p.Prenom, p.Email, p['Numéro de téléphone'], p.Source].map(txt).join(' ')).includes(q);
      })
      .sort((a, b) => txt(b["Date d'entrée (Prospect)"]).localeCompare(txt(a["Date d'entrée (Prospect)"])));
  }, [data.tables.Prospects, filter, query]);

  async function setStatut(p: Rec, statut: string) {
    setErr('');
    setBusy(p.id);
    try {
      onSaved('Prospects', await saveRecord('Prospects', { 'Statut prospect': statut, 'Traité par': me }, p.id));
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setBusy('');
    }
  }

  // Crée (ou retrouve par email) la fiche Client, puis ouvre un nouveau séjour pré-rempli
  async function convert(p: Rec) {
    setErr('');
    setBusy(p.id);
    try {
      const email = norm(p.Email);
      let client = email ? (data.tables.Clients ?? []).find(c => norm(c.Email) === email || norm(c.AutreEmail) === email) : undefined;
      if (!client) {
        const fields = {
          Nom: txt(p.Nom), Prenom: txt(p.Prenom), Email: txt(p.Email), 'Numéro de téléphone': txt(p['Numéro de téléphone']),
          'Régime alimentaire': txt(p['Régime alimentaire']), Taille: txt(p.Taille), Moucheur: !!p.Moucheur, Source: txt(p.Source),
          'Address Line 1': txt(p['Address Line 1']), 'Postal Code': txt(p['Postal Code']), City: txt(p.City), Country: txt(p.Country),
        };
        try {
          client = await saveRecord('Clients', fields);
        } catch (e) {
          if (e instanceof ApiError && e.status === 409 && e.data?.existingId) client = { id: e.data.existingId };
          else throw e;
        }
        onSaved('Clients', client);
      }
      if (txt(p['Statut prospect']) === 'Nouveau') onSaved('Prospects', await saveRecord('Prospects', { 'Statut prospect': 'En cours', 'Traité par': me }, p.id));
      const notes = [
        `Créé depuis le prospect du ${frDate(p["Date d'entrée (Prospect)"])} (${txt(p.Source) || 'source inconnue'}).`,
        Number(p.nbreAccompagnant) ? `Accompagnants annoncés : ${p.nbreAccompagnant}` : '',
        txt(p.Vols) && `Vols : ${txt(p.Vols)}`,
      ].filter(Boolean).join('\n');
      openSejour(null, {
        id: '',
        Status: 'Attente',
        'Date de début': txt(p['Date début souhaitée']),
        'Date de fin': txt(p['Date fin souhaitée']),
        Formule: txt(p['Formule du séjour']),
        'Nombre de pêcheurs': Number(p['Nombre de pêcheurs']) || 1,
        'Chef de groupe': [client.id],
        'Brief attentes': txt(p['Brief attentes']),
        Remarques: notes,
        _prospectId: p.id,
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setBusy('');
    }
  }

  return (
    <div className="card space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-auto text-lg font-semibold">Prospects (demandes du formulaire)</h2>
        <input className="input w-56" placeholder="Rechercher…" value={query} onChange={e => setQuery(e.target.value)} />
        <select className="input w-40" value={filter} onChange={e => setFilter(e.target.value)}>
          <option value="actifs">À traiter</option>
          {STATUTS.map(s => <option key={s} value={s}>{s}</option>)}
          <option value="tous">Tous</option>
        </select>
      </div>
      {err && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
      {list.length === 0 && <p className="text-sm text-slate-500">Aucun prospect.</p>}
      <div className="divide-y divide-slate-100">
        {list.map(p => {
          const st = txt(p['Statut prospect']) || 'Nouveau';
          return (
            <div key={p.id} className="flex flex-wrap items-start gap-3 py-3 text-sm">
              <div className="min-w-64 flex-1 space-y-1">
                <p>
                  <span className="font-medium">{txt(p.Prenom)} {txt(p.Nom).toUpperCase()}</span>
                  <span className="ml-2 text-xs text-slate-500">{txt(p.Email)} · {txt(p['Numéro de téléphone'])}</span>
                </p>
                <p className="text-slate-700">
                  {p['Date début souhaitée'] ? `${frDate(p['Date début souhaitée'])} → ${frDate(p['Date fin souhaitée'])}` : txt(p['Période souhaitée']) || 'dates ?'}
                  {' · '}{txt(p['Formule du séjour']) || 'formule ?'} · {Number(p['Nombre de pêcheurs']) || '?'} pêcheur(s)
                  {Number(p.nbreAccompagnant) ? ` + ${p.nbreAccompagnant} accompagnant(s)` : ''}
                </p>
                {txt(p['Brief attentes']) && <p className="whitespace-pre-wrap text-xs text-slate-600">{txt(p['Brief attentes'])}</p>}
                <p className="text-xs text-slate-500">
                  Reçu le {frDate(p["Date d'entrée (Prospect)"])} · source : {txt(p.Source) || '—'}{txt(p['Traité par']) && ` · traité par ${txt(p['Traité par'])}`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Pill tone={TONE[st] ?? 'info'}>{st}</Pill>
                <select className="input w-32" value={st} disabled={busy === p.id} onChange={e => setStatut(p, e.target.value)}>
                  {STATUTS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                {txt(p['Séjour créé'])
                  ? <button type="button" className="btn-light" onClick={() => openSejour(txt(p['Séjour créé']))}>Voir le séjour</button>
                  : <button type="button" className="btn" disabled={busy === p.id} onClick={() => convert(p)}>{busy === p.id ? '…' : 'Convertir en séjour'}</button>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
