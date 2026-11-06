import { useMemo, useState } from 'react';
import {
  ASSOC, action, byId, clientName, createAssoc, euro, findAssoc, findCompta, findMateriel, first, frDate, ids, isActive, MAT,
  materielLabel, num, occupants, overlaps, people, saveRecord, totalAcompte, txt, type AssocKind, type Data, type Rec, type Role,
} from './lib';
import { ClientPicker, Field, Pill, Select, TextInput } from './ui';

type Props = {
  data: Data;
  sejourId: string | null;
  preset?: Rec;
  onSaved: (table: string, r: Rec) => void;
  openSejour: (id: string) => void;
  openClient: (id: string) => void;
};
type Plan = { logement: string; guide: string; bateau: string; materiel: string[] };
const emptyPlan = (): Plan => ({ logement: '', guide: '', bateau: '', materiel: [] });
const KINDS: AssocKind[] = ['logement', 'guide', 'bateau'];
const KIND_LABEL: Record<AssocKind, string> = { logement: 'Chambre', guide: 'Guide', bateau: 'Bateau' };

export function SejourPanel({ data, sejourId, preset, onSaved, openSejour, openClient }: Props) {
  const { tables, choices } = data;
  const clients = tables.Clients;
  const clientsById = useMemo(() => byId(clients), [clients]);
  const original = sejourId ? tables['Séjour'].find(s => s.id === sejourId) : undefined;
  const [form, setForm] = useState<Rec>(original ? { ...original } : { id: '', Status: 'Attente', ...preset });
  const [plan, setPlan] = useState<Record<string, Plan>>({});
  const [withCompta, setWithCompta] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);
  const set = (k: string) => (v: unknown) => setForm(f => ({ ...f, [k]: v }));
  const sc = choices['Séjour'] ?? {};

  const chef = ids(form['Chef de groupe']);
  const participants = ids(form['Participants (Séjour)']);
  const accompagnants = ids(form['Accompagnants (Séjour)']);
  const nbPecheurs = new Set([...chef, ...participants]).size;
  const formPeople = people(form);

  const conflicts = useMemo(() => {
    const mine = new Set([...chef, ...participants, ...accompagnants]);
    return tables['Séjour'].filter(s => s.id !== sejourId && s.Status !== 'Inactive' && overlaps(s, form) && people(s).some(p => mine.has(p.id)));
  }, [tables, sejourId, form, chef, participants, accompagnants]);

  async function save() {
    setMsg(null);
    if (!form['Date de début'] || !form['Date de fin']) return setMsg({ tone: 'bad', text: 'Dates de début et de fin obligatoires.' });
    if (form['Date de fin'] < form['Date de début']) return setMsg({ tone: 'bad', text: 'La date de fin est avant la date de début.' });
    if (!chef.length) return setMsg({ tone: 'bad', text: 'Choisissez un chef de groupe.' });
    setSaving(true);
    const errors: string[] = [];
    try {
      const fields = {
        'Date de début': form['Date de début'],
        'Date de fin': form['Date de fin'],
        Formule: txt(form.Formule),
        Status: txt(form.Status),
        'Logement principal': txt(form['Logement principal']),
        'Nombre de pêcheurs': num(form['Nombre de pêcheurs']) || nbPecheurs,
        'Chef de groupe': chef,
        'Participants (Séjour)': participants.filter(id => !chef.includes(id)),
        'Accompagnants (Séjour)': accompagnants.filter(id => !chef.includes(id) && !participants.includes(id)),
        'Brief attentes': txt(form['Brief attentes']),
        Remarques: txt(form.Remarques),
      };
      const rec = await saveRecord('Séjour', fields, sejourId || undefined);
      onSaved('Séjour', rec);
      // Séjour créé depuis un prospect : le prospect passe en « Converti »
      if (!sejourId && preset?._prospectId) {
        try {
          onSaved('Prospects', await saveRecord('Prospects', {
            'Statut prospect': 'Converti', 'Séjour créé': rec.id, 'Traité par': data.user?.nom ?? '',
          }, String(preset._prospectId)));
        } catch (e) {
          errors.push(`prospect : ${e instanceof Error ? e.message : 'erreur'}`);
        }
      }

      if (!sejourId) {
        // Création en une fois : compta + attributions choisies pour chaque personne
        const tasks: { label: string; run: () => Promise<[string, Rec]> }[] = [];
        for (const p of people(rec)) {
          const who = clientName(clientsById[p.id]);
          if (withCompta) {
            tasks.push({
              label: `compta ${who}`,
              run: async () => ['Comptabilité', await saveRecord('Comptabilité', {
                Client: [p.id], ID_Séjour: [rec.id], Type: p.role === 'Accompagnant' ? 'Accompagnant' : 'Participant', Formule: txt(rec.Formule),
              })],
            });
          }
          const pl = plan[p.id] ?? emptyPlan();
          for (const kind of KINDS) {
            if (pl[kind]) tasks.push({ label: `${KIND_LABEL[kind].toLowerCase()} ${who}`, run: async () => [ASSOC[kind].table, await createAssoc(kind, rec.id, p.id, pl[kind])] });
          }
          for (const m of pl.materiel) tasks.push({ label: `matériel ${who}`, run: async () => [MAT.table, await createAssoc('materiel', rec.id, p.id, m)] });
        }
        for (let i = 0; i < tasks.length; i++) {
          setMsg({ tone: 'ok', text: `Séjour créé · attributions ${i + 1}/${tasks.length}…` });
          try {
            const [table, r] = await tasks[i].run();
            onSaved(table, r);
          } catch (e) {
            errors.push(`${tasks[i].label} : ${e instanceof Error ? e.message : 'erreur'}`);
          }
        }
        openSejour(rec.id);
        return;
      }
      setMsg({ tone: 'ok', text: 'Séjour enregistré.' });
    } catch (e) {
      errors.push(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setSaving(false);
      if (errors.length) setMsg({ tone: 'bad', text: errors.join(' · ') });
    }
  }

  const title = original
    ? `Séjour ${frDate(original['Date de début'])} → ${frDate(original['Date de fin'])} · ${clientName(clientsById[first(original['Chef de groupe']) ?? ''])}`
    : 'Nouveau séjour';
  const persons = original ? people(original) : [];
  const message = msg && <p className={`rounded-md px-3 py-2 text-sm ${msg.tone === 'ok' ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}>{msg.text}</p>;

  return (
    <div className="space-y-4">
      <div className="card space-y-4">
        <h2 className="text-lg font-semibold">{title}</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Date de début"><TextInput type="date" value={form['Date de début']} onChange={set('Date de début')} /></Field>
          <Field label="Date de fin"><TextInput type="date" value={form['Date de fin']} onChange={set('Date de fin')} /></Field>
          <Field label="Statut"><Select value={form.Status} onChange={set('Status')} options={sc.Status ?? []} /></Field>
          <Field label="Formule"><Select value={form.Formule} onChange={set('Formule')} options={sc.Formule ?? []} /></Field>
          <Field label="Logement principal"><Select value={form['Logement principal']} onChange={set('Logement principal')} options={sc['Logement principal'] ?? []} /></Field>
          <Field label={`Nombre de pêcheurs (liés : ${nbPecheurs})`}>
            <TextInput type="number" min={0} value={form['Nombre de pêcheurs']} onChange={v => set('Nombre de pêcheurs')(v === '' ? '' : Number(v))} />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Chef de groupe"><ClientPicker clients={clients} value={chef} onChange={set('Chef de groupe')} /></Field>
          <Field label="Participants (pêcheurs)"><ClientPicker clients={clients} value={participants} onChange={set('Participants (Séjour)')} multiple /></Field>
          <Field label="Accompagnants (non pêcheurs)"><ClientPicker clients={clients} value={accompagnants} onChange={set('Accompagnants (Séjour)')} multiple /></Field>
        </div>
        <p className="text-xs text-slate-500">Client absent de la liste ? Créez-le d’abord dans l’onglet Clients.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Brief attentes"><textarea className="input min-h-20" value={txt(form['Brief attentes'])} onChange={e => set('Brief attentes')(e.target.value)} /></Field>
          <Field label="Remarques"><textarea className="input min-h-20" value={txt(form.Remarques)} onChange={e => set('Remarques')(e.target.value)} /></Field>
        </div>
        {conflicts.length > 0 && (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            Attention : une ou plusieurs personnes ont déjà un séjour sur ces dates :
            {conflicts.map(s => (
              <button key={s.id} type="button" className="ml-2 underline" onClick={() => openSejour(s.id)}>
                {frDate(s['Date de début'])} ({clientName(clientsById[first(s['Chef de groupe']) ?? ''])})
              </button>
            ))}
          </div>
        )}
        {original && message}
        {original && (
          <div className="flex justify-end">
            <button type="button" className="btn" disabled={saving} onClick={save}>{saving ? 'Enregistrement…' : 'Enregistrer le séjour'}</button>
          </div>
        )}
      </div>

      {!original && (
        <div className="card space-y-3">
          <div>
            <h3 className="font-semibold">Attributions (créées en même temps que le séjour)</h3>
            <p className="text-xs text-slate-500">Choisissez les dates puis les personnes : les disponibilités sont calculées sur ces dates. Tout est facultatif et modifiable ensuite.</p>
          </div>
          {formPeople.length === 0 && <p className="text-sm text-slate-500">Ajoutez d’abord un chef de groupe et les participants.</p>}
          {formPeople.map(p => (
            <PlanRow key={p.id} data={data} sejour={form} clientId={p.id} role={p.role} client={clientsById[p.id]} allPlans={plan}
              value={plan[p.id] ?? emptyPlan()} onChange={v => setPlan(pl => ({ ...pl, [p.id]: v }))} />
          ))}
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={withCompta} onChange={e => setWithCompta(e.target.checked)} />
            Créer aussi une ligne Comptabilité par personne (type et formule pré-remplis)
          </label>
          {message}
          <div className="flex justify-end">
            <button type="button" className="btn" disabled={saving} onClick={save}>{saving ? 'Création…' : 'Créer le séjour et les attributions'}</button>
          </div>
        </div>
      )}

      {original && <ContractBar sejour={original} data={data} />}

      {original && (
        <div className="card space-y-3">
          <div>
            <h3 className="font-semibold">Suivi par client</h3>
            <p className="text-xs text-slate-500">Chambre, guide, bateau et matériel sont enregistrés dès qu’on les choisit. Après avoir ajouté des personnes au séjour, cliquez sur « Enregistrer le séjour ».</p>
          </div>
          {persons.length === 0 && <p className="text-sm text-slate-500">Aucune personne liée.</p>}
          {persons.map(p => (
            <PersonRow key={p.id} data={data} sejour={original} clientId={p.id} role={p.role} client={clientsById[p.id]} onSaved={onSaved} openClient={openClient} />
          ))}
        </div>
      )}

      {original && <TrajetsSection data={data} sejour={original} onSaved={onSaved} />}
    </div>
  );
}

// ---------------------------------------------------------------- contrats : génération et envoi
type Busy = { key: string; tone?: 'ok' | 'bad'; text?: string };

export function useContractActions() {
  const [state, setState] = useState<Busy>({ key: '' });
  const run = async (key: string, label: string, body: Record<string, unknown>, confirmText?: string) => {
    if (confirmText && !confirm(confirmText)) return;
    setState({ key });
    try {
      const r = await action<{ resultats?: { personne: string; ok: boolean; message: string }[] }>(body);
      const details = (r.resultats ?? []).map(x => `${x.ok ? '✓' : '✗'} ${x.personne} : ${x.message}`).join(' · ');
      const bad = (r.resultats ?? []).some(x => !x.ok);
      setState({ key: '', tone: bad ? 'bad' : 'ok', text: `${label}${details ? ` — ${details}` : ''}` });
    } catch (e) {
      setState({ key: '', tone: 'bad', text: e instanceof Error ? e.message : 'Erreur' });
    }
  };
  return { state, run };
}

function ContractBar({ sejour, data }: { sejour: Rec; data: Data }) {
  const { state, run } = useContractActions();
  const comptaIds = people(sejour).map(p => findCompta(data.tables, sejour.id, p.id)?.id).filter(Boolean) as string[];
  return (
    <div className="card space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="mr-auto font-semibold">Contrats du séjour</h3>
        <button type="button" className="btn-light" disabled={!!state.key}
          onClick={() => run('gen', 'Génération lancée : contrats Word + PDF dans Drive › Contrats d’ici une à deux minutes (rapport : Tableaux › 0_Rapport contrats).', { type: 'contrats', sejourId: sejour.id })}>
          {state.key === 'gen' ? 'Lancement…' : 'Générer tous les contrats (docx + pdf)'}
        </button>
        <button type="button" className="btn-light" disabled={!!state.key || !comptaIds.length}
          onClick={() => run('mail', 'Envoi par email terminé', { type: 'envoi', mode: 'email', comptaIds }, `Envoyer le contrat PDF par email aux ${comptaIds.length} personne(s) du séjour ?`)}>
          {state.key === 'mail' ? 'Envoi…' : 'Envoyer tous par email'}
        </button>
        <button type="button" className="btn" disabled={!!state.key || !comptaIds.length}
          onClick={() => run('sign', 'Demandes de signature envoyées (Yousign)', { type: 'envoi', mode: 'signature', comptaIds }, `Envoyer les ${comptaIds.length} contrat(s) en signature électronique (Yousign) ?`)}>
          {state.key === 'sign' ? 'Envoi…' : 'Tous en signature électronique'}
        </button>
      </div>
      <p className="text-xs text-slate-500">Générez d’abord les contrats (le PDF doit exister dans Drive), puis envoyez-les. Le contrat d’une seule personne se gère sur sa ligne ci-dessous.</p>
      {state.text && <p className={`rounded-md px-3 py-2 text-sm ${state.tone === 'ok' ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}>{state.text}</p>}
    </div>
  );
}

// ---------------------------------------------------------------- création : choix par personne
function PlanRow({ data, sejour, clientId, role, client, value, onChange, allPlans }: {
  data: Data; sejour: Rec; clientId: string; role: Role; client?: Rec; value: Plan; onChange: (v: Plan) => void; allPlans: Record<string, Plan>;
}) {
  // Choix déjà faits pour les AUTRES personnes du formulaire : déduits des disponibilités
  const planned = useMemo(() => {
    const out: Planned = {};
    const add = (k: AssocKind | 'materiel', id: string) => { if (id) ((out[k] ??= {})[id] = (out[k]![id] ?? 0) + 1); };
    for (const [pid, pl] of Object.entries(allPlans)) {
      if (pid === clientId) continue;
      KINDS.forEach(k => add(k, pl[k]));
      pl.materiel.forEach(m => add('materiel', m));
    }
    return out;
  }, [allPlans, clientId]);
  const options = useResourceOptions(data, sejour, clientId, planned);
  const hasDates = !!sejour['Date de début'] && !!sejour['Date de fin'];
  return (
    <div className="rounded-md border border-slate-200 p-3">
      <p className="mb-2 text-sm"><span className="font-medium">{clientName(client)}</span> <span className="text-xs text-slate-500">{role}</span></p>
      <div className="grid gap-3 sm:grid-cols-4">
        {KINDS.map(kind => (
          <Field key={kind} label={KIND_LABEL[kind]}>
            <Select value={value[kind]} onChange={v => onChange({ ...value, [kind]: v })} options={hasDates ? options[kind] : []} empty={hasDates ? '— aucun —' : 'dates d’abord'} />
          </Field>
        ))}
        <Field label="Matériel">
          <MaterielPick options={hasDates ? options.materiel : []} selected={value.materiel}
            onAdd={id => onChange({ ...value, materiel: [...value.materiel, id] })}
            onRemove={id => onChange({ ...value, materiel: value.materiel.filter(m => m !== id) })} />
        </Field>
      </div>
    </div>
  );
}

function MaterielPick({ options, selected, onAdd, onRemove, busy = false }: {
  options: { value: string; label: string; disabled?: boolean }[]; selected: string[]; onAdd: (id: string) => void; onRemove: (id: string) => void; busy?: boolean;
}) {
  const label = (id: string) => options.find(o => o.value === id)?.label.split(' — ')[0] ?? 'matériel';
  return (
    <div className="space-y-1">
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selected.map(id => (
            <span key={id} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs">
              {label(id)}
              <button type="button" disabled={busy} className="hover:text-red-600" onClick={() => onRemove(id)} aria-label="Retirer">×</button>
            </span>
          ))}
        </div>
      )}
      <Select value="" onChange={v => v && onAdd(v)} empty={busy ? 'enregistrement…' : '+ ajouter'}
        options={options.filter(o => !selected.includes(o.value))} />
    </div>
  );
}

// ---------------------------------------------------------------- séjour existant : une ligne par client
const COMPTA_DATES = ['Mail confirmation', 'Contrat envoyé', 'Contrat signé', 'Email tic tac'];

function PersonRow({ data, sejour, clientId, role, client, onSaved, openClient }: {
  data: Data; sejour: Rec; clientId: string; role: Role; client?: Rec;
  onSaved: (table: string, r: Rec) => void; openClient: (id: string) => void;
}) {
  const { tables, choices } = data;
  const compta = findCompta(tables, sejour.id, clientId);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Rec>(compta ? { ...compta } : {
    id: '', Type: role === 'Accompagnant' ? 'Accompagnant' : 'Participant', Formule: sejour.Formule ?? '',
  });
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const set = (k: string) => (v: unknown) => setForm(f => ({ ...f, [k]: v }));
  const cc = choices['Comptabilité'] ?? {};

  async function run(key: string, fn: () => Promise<void>) {
    setErr('');
    setOk('');
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setBusy('');
    }
  }

  const saveCompta = () => run('compta', async () => {
    const fields: Record<string, unknown> = {
      Client: [clientId], ID_Séjour: [sejour.id], Formule: txt(form.Formule), Type: txt(form.Type),
      'Tarif individuel': form['Tarif individuel'] === '' || form['Tarif individuel'] === undefined ? null : Number(form['Tarif individuel']),
    };
    for (const k of ['Date_acompte 1', 'Type_acompte 1', 'Date_acompte 2', 'Type_acompte 2', 'Date_solde', 'Type_solde', ...COMPTA_DATES]) fields[k] = txt(form[k]);
    const rec = await saveRecord('Comptabilité', fields, compta?.id);
    onSaved('Comptabilité', rec);
    setForm({ ...rec });
    setOk(`Compta enregistrée à ${new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}.`);
  });

  const saveAssoc = (kind: AssocKind, value: string) => run(kind, async () => {
    const a = ASSOC[kind];
    const existing = findAssoc(tables, kind, sejour.id, clientId);
    let rec: Rec | null = null;
    if (!value && existing) rec = await saveRecord(a.table, { Statut: 'Inactive' }, existing.id);
    else if (value && existing) rec = await saveRecord(a.table, { [a.res]: [value], Statut: 'Active' }, existing.id);
    else if (value) rec = await createAssoc(kind, sejour.id, clientId, value);
    if (rec) onSaved(a.table, rec);
  });

  const mats = findMateriel(tables, sejour.id, clientId);
  const addMat = (id: string) => run('materiel', async () => onSaved(MAT.table, await createAssoc('materiel', sejour.id, clientId, id)));
  const removeMat = (id: string) => run('materiel', async () => {
    const a = mats.find(r => ids(r.Materiel).includes(id));
    if (a) onSaved(MAT.table, await saveRecord(MAT.table, { Statut: 'Inactive' }, a.id));
  });

  const options = useResourceOptions(data, sejour, clientId);
  const current = (kind: AssocKind) => first(findAssoc(tables, kind, sejour.id, clientId)?.[ASSOC[kind].res]) ?? '';
  const signed = !!compta?.['Contrat signé'];
  const contrat = useContractActions();
  const sigStatus = txt(compta?.['Signature statut']);

  return (
    <div className="rounded-md border border-slate-200">
      <div className="flex flex-wrap items-center gap-2 p-3">
        <button type="button" className="font-medium text-sky-800 hover:underline" onClick={() => openClient(clientId)}>{clientName(client)}</button>
        <span className="text-xs text-slate-500">{role}</span>
        <Pill tone={compta ? 'ok' : 'bad'}>{compta ? 'Compta' : 'Sans compta'}</Pill>
        <Pill tone={signed ? 'ok' : 'warn'}>{signed ? `Signé ${frDate(compta?.['Contrat signé'])}` : 'Contrat non signé'}</Pill>
        {sigStatus && !signed && <Pill tone={sigStatus === 'Erreur' || sigStatus === 'Refusé' ? 'bad' : 'info'}>{sigStatus}</Pill>}
        {compta && <span className="text-xs text-slate-600">Tarif {euro(num(compta['Tarif individuel']))} · TotalAcompte {euro(totalAcompte(compta))}</span>}
        <div className="ml-auto flex flex-wrap gap-1">
          <button type="button" className="btn-light" disabled={!!contrat.state.key}
            onClick={() => contrat.run('gen', 'Génération lancée (docx + pdf dans Drive d’ici une minute).', { type: 'contrats', sejourId: sejour.id, clientId })}>
            {contrat.state.key === 'gen' ? '…' : 'Contrat'}
          </button>
          {compta && (
            <>
              <button type="button" className="btn-light" disabled={!!contrat.state.key}
                onClick={() => contrat.run('mail', 'Envoyé', { type: 'envoi', mode: 'email', comptaIds: [compta.id] }, `Envoyer le contrat PDF par email à ${clientName(client)} ?`)}>
                {contrat.state.key === 'mail' ? '…' : 'Email'}
              </button>
              <button type="button" className="btn-light" disabled={!!contrat.state.key}
                onClick={() => contrat.run('sign', 'Signature demandée', { type: 'envoi', mode: 'signature', comptaIds: [compta.id] }, `Envoyer le contrat de ${clientName(client)} en signature électronique ?`)}>
                {contrat.state.key === 'sign' ? '…' : 'Signature'}
              </button>
            </>
          )}
          <button type="button" className="btn-light" onClick={() => setOpen(o => !o)}>{open ? 'Fermer' : 'Compta & suivi'}</button>
        </div>
      </div>
      {contrat.state.text && <p className={`mx-3 mb-2 rounded-md px-3 py-1.5 text-xs ${contrat.state.tone === 'ok' ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}>{contrat.state.text}</p>}
      <div className="grid gap-3 border-t border-slate-100 p-3 sm:grid-cols-4">
        {KINDS.map(kind => (
          <Field key={kind} label={KIND_LABEL[kind] + (busy === kind ? ' (enregistrement…)' : '')}>
            <Select value={current(kind)} onChange={v => saveAssoc(kind, v)} options={options[kind]} empty="— non attribué —" missing={kind === 'logement' && !current(kind)} />
          </Field>
        ))}
        <Field label="Matériel">
          <MaterielPick options={options.materiel} selected={mats.flatMap(r => ids(r.Materiel))} onAdd={addMat} onRemove={removeMat} busy={busy === 'materiel'} />
        </Field>
      </div>
      {open && (
        <div className="space-y-3 border-t border-slate-100 bg-slate-50 p-3">
          <div className="grid gap-3 sm:grid-cols-4">
            <Field label="Type"><Select value={form.Type} onChange={set('Type')} options={cc.Type ?? []} /></Field>
            <Field label="Formule"><Select value={form.Formule} onChange={set('Formule')} options={cc.Formule ?? choices['Séjour']?.Formule ?? []} /></Field>
            <Field label="Tarif individuel (€)"><TextInput type="number" min={0} step="0.01" value={form['Tarif individuel']} onChange={set('Tarif individuel')} /></Field>
            <div className="text-xs text-slate-600">
              <span className="label">Montants calculés (Airtable)</span>
              Acompte 1 : {euro(num(compta?.Montant_acompte_1))}<br />Acompte 2 : {euro(num(compta?.Montant_acompte_2))}<br />Solde : {euro(num(compta?.Montant_solde))}
            </div>
            <Field label="Acompte 1 · date de versement"><TextInput type="date" value={form['Date_acompte 1']} onChange={set('Date_acompte 1')} /></Field>
            <Field label="Acompte 1 · type"><Select value={form['Type_acompte 1']} onChange={set('Type_acompte 1')} options={cc['Type_acompte 1'] ?? []} /></Field>
            <Field label="Acompte 2 · date de versement"><TextInput type="date" value={form['Date_acompte 2']} onChange={set('Date_acompte 2')} /></Field>
            <Field label="Acompte 2 · type"><Select value={form['Type_acompte 2']} onChange={set('Type_acompte 2')} options={cc['Type_acompte 2'] ?? []} /></Field>
            <Field label="Solde · date de versement"><TextInput type="date" value={form.Date_solde} onChange={set('Date_solde')} /></Field>
            <Field label="Solde · type"><Select value={form.Type_solde} onChange={set('Type_solde')} options={cc.Type_solde ?? []} /></Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-4">
            {COMPTA_DATES.map(k => (
              <Field key={k} label={k}><TextInput type="date" value={form[k]} onChange={set(k)} /></Field>
            ))}
          </div>
          <p className="text-xs text-slate-500">Un acompte compte dans TotalAcompte seulement si sa date de versement est remplie. Les montants sont recalculés par Airtable après enregistrement.</p>
          <div className="flex items-center justify-end gap-3">
            {ok && <span className="text-sm text-emerald-700">{ok}</span>}
            <button type="button" className="btn" disabled={busy === 'compta'} onClick={saveCompta}>{busy === 'compta' ? 'Enregistrement…' : compta ? 'Mettre à jour la compta' : 'Créer la ligne compta'}</button>
          </div>
        </div>
      )}
      {err && <p className="border-t border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
    </div>
  );
}

// ---------------------------------------------------------------- trajets aéroport du séjour
const toLocalInput = (iso: unknown) => {
  const d = new Date(txt(iso));
  if (!txt(iso) || isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : null);

function TrajetsSection({ data, sejour, onSaved }: { data: Data; sejour: Rec; onSaved: (table: string, r: Rec) => void }) {
  const trajets = (data.tables.Trajet ?? []).filter(t => ids(t['Séjour']).includes(sejour.id));
  const [drafts, setDrafts] = useState<Rec[]>([]);
  const allPeople = people(sejour).map(p => p.id);
  const add = (kind: 'aller' | 'retour') => {
    const day = txt(kind === 'aller' ? sejour['Date de début'] : sejour['Date de fin']);
    setDrafts(d => [...d, { id: `draft-${Date.now()}`, Remarques: kind === 'aller' ? 'Aller' : 'Retour', Clients: allPeople, 'Date du trajet départ': day ? new Date(`${day}T10:00`).toISOString() : '' }]);
  };
  return (
    <div className="card space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="mr-auto font-semibold">Trajets aéroport</h3>
        <button type="button" className="btn-light" onClick={() => add('aller')}>+ Trajet aller</button>
        <button type="button" className="btn-light" onClick={() => add('retour')}>+ Trajet retour</button>
      </div>
      {trajets.length === 0 && drafts.length === 0 && <p className="text-sm text-slate-500">Aucun trajet lié à ce séjour.</p>}
      {trajets.map(t => <TrajetEditor key={t.id} data={data} sejour={sejour} trajet={t} onSaved={onSaved} />)}
      {drafts.map(t => (
        <TrajetEditor key={t.id} data={data} sejour={sejour} trajet={t}
          onSaved={(table, r) => { onSaved(table, r); setDrafts(d => d.filter(x => x.id !== t.id)); }}
          onCancel={() => setDrafts(d => d.filter(x => x.id !== t.id))} />
      ))}
    </div>
  );
}

function TrajetEditor({ data, sejour, trajet, onSaved, onCancel }: {
  data: Data; sejour: Rec; trajet: Rec; onSaved: (table: string, r: Rec) => void; onCancel?: () => void;
}) {
  const isNew = trajet.id.startsWith('draft-');
  const [form, setForm] = useState<Rec>({ ...trajet });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = (k: string) => (v: unknown) => setForm(f => ({ ...f, [k]: v }));
  const airports = data.choices.Trajet?.['Aéroport de départ/arrivée'] ?? [];
  const staff = data.tables.Staff ?? [];
  const clients = byId(data.tables.Clients);
  const toggle = (k: string, id: string) => {
    const cur = ids(form[k]);
    set(k)(cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id]);
  };

  async function save() {
    setErr('');
    setBusy(true);
    try {
      const rec = await saveRecord('Trajet', {
        'Séjour': [sejour.id],
        'Date du trajet départ': fromLocalInput(toLocalInput(form['Date du trajet départ'])),
        'Date du trajet arrivée': fromLocalInput(toLocalInput(form['Date du trajet arrivée'])),
        'Aéroport de départ/arrivée': Array.isArray(form['Aéroport de départ/arrivée']) ? form['Aéroport de départ/arrivée'] : [],
        'Chauffeurs / Staff': ids(form['Chauffeurs / Staff']),
        Clients: ids(form.Clients),
        'Véhicules utilisés': txt(form['Véhicules utilisés']),
        Remarques: txt(form.Remarques),
      }, isNew ? undefined : trajet.id);
      onSaved('Trajet', rec);
      if (!isNew) setForm({ ...rec });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setBusy(false);
    }
  }

  const selectedAirports: string[] = Array.isArray(form['Aéroport de départ/arrivée']) ? form['Aéroport de départ/arrivée'] : [];
  return (
    <div className={`space-y-3 rounded-md border p-3 ${isNew ? 'border-sky-300 bg-sky-50/40' : 'border-slate-200'}`}>
      <div className="grid gap-3 sm:grid-cols-4">
        <Field label="Départ (date et heure)">
          <TextInput type="datetime-local" value={toLocalInput(form['Date du trajet départ'])} onChange={v => set('Date du trajet départ')(fromLocalInput(v))} />
        </Field>
        <Field label="Arrivée (date et heure)">
          <TextInput type="datetime-local" value={toLocalInput(form['Date du trajet arrivée'])} onChange={v => set('Date du trajet arrivée')(fromLocalInput(v))} />
        </Field>
        <Field label="Véhicule(s)"><TextInput value={form['Véhicules utilisés']} onChange={set('Véhicules utilisés')} /></Field>
        <Field label="Remarques"><TextInput value={form.Remarques} onChange={set('Remarques')} /></Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <span className="label">Aéroport</span>
          <div className="flex flex-wrap gap-3 text-sm">
            {airports.map(a => (
              <label key={a} className="flex items-center gap-1">
                <input type="checkbox" checked={selectedAirports.includes(a)}
                  onChange={() => set('Aéroport de départ/arrivée')(selectedAirports.includes(a) ? selectedAirports.filter(x => x !== a) : [...selectedAirports, a])} /> {a}
              </label>
            ))}
          </div>
        </div>
        <div>
          <span className="label">Chauffeur(s)</span>
          <div className="flex flex-wrap gap-3 text-sm">
            {staff.map(s => (
              <label key={s.id} className="flex items-center gap-1">
                <input type="checkbox" checked={ids(form['Chauffeurs / Staff']).includes(s.id)} onChange={() => toggle('Chauffeurs / Staff', s.id)} /> {txt(s['Prénom NOM'])}
              </label>
            ))}
          </div>
        </div>
        <div>
          <span className="label">Passagers</span>
          <div className="flex flex-wrap gap-3 text-sm">
            {people(sejour).map(p => (
              <label key={p.id} className="flex items-center gap-1">
                <input type="checkbox" checked={ids(form.Clients).includes(p.id)} onChange={() => toggle('Clients', p.id)} /> {clientName(clients[p.id])}
              </label>
            ))}
          </div>
        </div>
      </div>
      {err && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
      <div className="flex justify-end gap-2">
        {onCancel && <button type="button" className="btn-light" onClick={onCancel}>Annuler</button>}
        <button type="button" className="btn" disabled={busy} onClick={save}>{busy ? 'Enregistrement…' : isNew ? 'Créer le trajet' : 'Mettre à jour'}</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- disponibilités sur les dates du séjour
// Places prises = somme des clients des liaisons actives dont le séjour chevauche la période
// (une liaison à 3 clients occupe 3 lits), + les choix pas encore enregistrés du formulaire en cours (planned).
type Planned = Partial<Record<AssocKind | 'materiel', Record<string, number>>>;

function useResourceOptions(data: Data, sejour: Rec, clientId: string, planned: Planned = {}) {
  const { tables } = data;
  return useMemo(() => {
    const sejours = byId(tables['Séjour']);
    const clients = byId(tables.Clients);
    const overlapping = (r: Rec) => {
      const s = sejours[first(r.ID_Séjour) ?? ''];
      return s && s.Status !== 'Inactive' && overlaps(s, sejour);
    };
    const holdersIn = (table: string, clientField: string, resField: string, resId: string) =>
      (tables[table] ?? []).filter(r => isActive(r) && ids(r[resField]).includes(resId) && overlapping(r)
        && !(ids(r.ID_Séjour).includes(sejour.id) && ids(r[clientField]).includes(clientId)));
    const holders = (kind: AssocKind, resId: string) => holdersIn(ASSOC[kind].table, ASSOC[kind].client, ASSOC[kind].res, resId);
    const taken = (kind: AssocKind, resId: string) =>
      holders(kind, resId).reduce((n, r) => n + occupants(r, ASSOC[kind].client), 0) + (planned[kind]?.[resId] ?? 0);
    const chefOf = (r: Rec) => clientName(clients[first(sejours[first(r.ID_Séjour) ?? '']?.['Chef de groupe']) ?? '']);
    const others = (h: Rec[]) => {
      const names = [...new Set(h.filter(r => !ids(r.ID_Séjour).includes(sejour.id)).map(chefOf))];
      return names.length ? ` — déjà avec ${names.join(', ')}` : '';
    };

    const logement = [...(tables.Logement ?? [])]
      .sort((a, b) => txt(a['Résidence']).localeCompare(txt(b['Résidence'])) || txt(a.Titre).localeCompare(txt(b.Titre), 'fr', { numeric: true }))
      .map(l => {
        const lits = num(l['Nombre de lits']);
        const pris = taken('logement', l.id);
        const libre = lits - pris;
        return {
          value: l.id,
          label: `${txt(l['Résidence'])} · ${txt(l.Titre)} — ${lits ? `${Math.max(libre, 0)} lit(s) libre(s) sur ${lits}` : `${pris} occupant(s)`}${libre < 0 ? ' ⚠ surbooking' : ''}`,
          disabled: lits > 0 && pris >= lits,
        };
      });
    const guide = (tables.Staff ?? [])
      .filter(s => (Array.isArray(s.Profil) ? s.Profil : []).includes('Guide'))
      .map(s => ({ value: s.id, label: `${txt(s['Prénom NOM'])}${others(holders('guide', s.id))}${planned.guide?.[s.id] ? ` — choisi pour ${planned.guide[s.id]} autre(s) ici` : ''}` }));
    const bateau = (tables.Bateau ?? []).map(b => {
      const cap = num(b['Capacité maximale (personnes)']);
      const pris = taken('bateau', b.id);
      return {
        value: b.id,
        label: `${txt(b['Nom du bateau'])} (${txt(b['Type de bateau'])})${cap ? ` — ${Math.max(cap - pris, 0)} place(s) libre(s) sur ${cap}` : pris ? ` — ${pris} personne(s)` : ''}${b['Disponible pour la saison'] ? '' : ' — indisponible cette saison'}${others(holders('bateau', b.id))}`,
        disabled: cap > 0 && pris >= cap,
      };
    });
    const materiel = [...(tables.Materiel ?? [])]
      .sort((a, b) => materielLabel(a).localeCompare(materielLabel(b), 'fr', { numeric: true }))
      .map(m => {
        const stock = num(m.Stock) || 1;
        const pris = holdersIn(MAT.table, MAT.client, MAT.res, m.id).length + (planned.materiel?.[m.id] ?? 0);
        return { value: m.id, label: `${materielLabel(m)} — ${Math.max(stock - pris, 0)} dispo sur ${stock}`, disabled: pris >= stock };
      });
    return { logement, guide, bateau, materiel };
  }, [tables, sejour, clientId, planned]);
}
