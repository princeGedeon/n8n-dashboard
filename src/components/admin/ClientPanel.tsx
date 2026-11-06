import { useMemo, useState } from 'react';
import { ApiError, clientName, frDate, ids, norm, people, saveRecord, txt, type Data, type Rec } from './lib';
import { Field, Pill, TextInput } from './ui';

const IMPORTANT = ['Email', 'Numéro de téléphone', 'Régime alimentaire', 'Taille'];
const EMPTY: Rec = { id: '', Prenom: '', Nom: '', Email: '', 'Numéro de téléphone': '', Moucheur: false };

export function ClientPanel({ data, clientId, onSaved, openClient, openSejour }: {
  data: Data;
  clientId: string | null;
  onSaved: (table: string, r: Rec) => void;
  openClient: (id: string) => void;
  openSejour: (id: string | null, preset?: Rec) => void;
}) {
  const clients = data.tables.Clients;
  const original = clientId ? clients.find(c => c.id === clientId) : undefined;
  const [form, setForm] = useState<Rec>(original ? { ...original } : { ...EMPTY });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);
  const [conflict, setConflict] = useState<string | null>(null);
  const set = (k: string) => (v: unknown) => setForm(f => ({ ...f, [k]: v }));

  // Doublons possibles : même email, ou même nom + prénom
  const duplicates = useMemo(() => {
    const email = norm(form.Email);
    const name = norm(`${form.Prenom} ${form.Nom}`);
    return clients.filter(c => c.id !== clientId && (
      (email && (norm(c.Email) === email || norm(c.AutreEmail) === email)) ||
      (norm(form.Nom) && norm(form.Prenom) && norm(`${c.Prenom} ${c.Nom}`) === name)
    ));
  }, [clients, clientId, form.Email, form.Nom, form.Prenom]);

  const sejours = useMemo(
    () => data.tables['Séjour']
      .map(s => ({ s, p: people(s).find(p => p.id === clientId) }))
      .filter(x => clientId && x.p)
      .sort((a, b) => txt(b.s['Date de début']).localeCompare(txt(a.s['Date de début']))),
    [data.tables, clientId],
  );

  async function save(force = false) {
    setMsg(null);
    if (!txt(form.Nom).trim() && !txt(form.Prenom).trim()) return setMsg({ tone: 'bad', text: 'Nom ou prénom obligatoire.' });
    if (txt(form.Email) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(txt(form.Email).trim())) return setMsg({ tone: 'bad', text: 'Email invalide.' });
    setSaving(true);
    try {
      const { id, ...fields } = form;
      const keep = ['Prenom', 'Nom', 'Email', 'AutreEmail', 'Numéro de téléphone', 'Régime alimentaire', 'Taille', 'Moucheur',
        'Apporteur', 'Source', 'Address Line 1', 'Address Line 2', 'Postal Code', 'City', 'Country', 'Company', 'Notes relance'];
      const payload = Object.fromEntries(keep.map(k => [k, k === 'Moucheur' ? !!fields[k] : txt(fields[k])]));
      const rec = await saveRecord('Clients', payload, clientId || undefined, force);
      onSaved('Clients', rec);
      setConflict(null);
      setMsg({ tone: 'ok', text: 'Client enregistré.' });
      if (!clientId) openClient(rec.id);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) setConflict(e.data?.existingId ?? null);
      setMsg({ tone: 'bad', text: e instanceof Error ? e.message : 'Erreur' });
    } finally {
      setSaving(false);
    }
  }

  function newSejour() {
    const last = sejours[0]?.s;
    openSejour(null, {
      id: '',
      'Chef de groupe': [clientId],
      Formule: last?.Formule ?? '',
      'Nombre de pêcheurs': last?.['Nombre de pêcheurs'] ?? '',
      'Logement principal': last?.['Logement principal'] ?? '',
      Status: 'Attente',
    });
  }

  const input = (k: string, label: string, props: Record<string, unknown> = {}) => (
    <Field label={label}>
      <TextInput value={form[k]} onChange={set(k)} missing={!!clientId && IMPORTANT.includes(k) && !txt(form[k]).trim()} {...props} />
    </Field>
  );

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="card space-y-4 lg:col-span-2">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{clientId ? clientName(original) : 'Nouveau client'}</h2>
          {clientId && IMPORTANT.some(k => !txt(form[k]).trim()) && <Pill tone="warn">Fiche incomplète</Pill>}
        </div>

        {duplicates.length > 0 && (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            <p className="font-medium">Client(s) déjà existant(s) qui ressemble(nt) :</p>
            <ul className="mt-1 space-y-1">
              {duplicates.slice(0, 5).map(d => (
                <li key={d.id}>
                  {clientName(d)} · {txt(d.Email) || 'sans email'}{' '}
                  <button type="button" className="underline" onClick={() => openClient(d.id)}>ouvrir la fiche</button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          {input('Prenom', 'Prénom')}
          {input('Nom', 'Nom')}
          {input('Email', 'Email', { type: 'email' })}
          {input('AutreEmail', 'Autre email')}
          {input('Numéro de téléphone', 'Téléphone')}
          {input('Régime alimentaire', 'Régime alimentaire')}
          {input('Taille', 'Taille (vêtements / waders)')}
          {input('Apporteur', 'Apporteur')}
          {input('Address Line 1', 'Adresse')}
          {input('Address Line 2', 'Complément d’adresse')}
          {input('Postal Code', 'Code postal')}
          {input('City', 'Ville')}
          {input('Country', 'Pays')}
          {input('Source', 'Source')}
          {input('Company', 'Société')}
          <label className="flex items-center gap-2 self-end pb-2 text-sm">
            <input type="checkbox" checked={!!form.Moucheur} onChange={e => set('Moucheur')(e.target.checked)} /> Moucheur
          </label>
        </div>
        <Field label="Notes">
          <textarea className="input min-h-20" value={txt(form['Notes relance'])} onChange={e => set('Notes relance')(e.target.value)} />
        </Field>

        {msg && <p className={`rounded-md px-3 py-2 text-sm ${msg.tone === 'ok' ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}>{msg.text}</p>}
        {conflict && (
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-light" onClick={() => openClient(conflict)}>Ouvrir la fiche existante</button>
            <button type="button" className="btn-light" onClick={() => save(true)}>Créer quand même</button>
          </div>
        )}
        <div className="flex justify-end">
          <button type="button" className="btn" disabled={saving} onClick={() => save()}>{saving ? 'Enregistrement…' : 'Enregistrer le client'}</button>
        </div>
      </div>

      <div className="card space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Séjours</h3>
          {clientId && <button type="button" className="btn-light" onClick={newSejour}>+ Nouveau séjour</button>}
        </div>
        {!clientId && <p className="text-sm text-slate-500">Enregistrez d’abord le client.</p>}
        {clientId && sejours.length === 0 && <p className="text-sm text-slate-500">Aucun séjour.</p>}
        <ul className="space-y-2">
          {sejours.map(({ s, p }) => (
            <li key={s.id}>
              <button type="button" className="w-full rounded-md border border-slate-200 p-2 text-left text-sm hover:bg-slate-50" onClick={() => openSejour(s.id)}>
                <span className="font-medium">{frDate(s['Date de début'])} → {frDate(s['Date de fin'])}</span>
                <span className="ml-2 text-slate-500">{p?.role} · {txt(s.Formule) || 'formule ?'} · {txt(s.Status)}</span>
                <span className="block text-xs text-slate-500">{ids(s['Participants (Séjour)']).length + ids(s['Chef de groupe']).length} pêcheur(s)</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
