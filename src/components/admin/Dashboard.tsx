import { useCallback, useEffect, useMemo, useState } from 'react';
import { ClientPanel } from './ClientPanel';
import { action, api, txt, type Data, type Rec } from './lib';
import { ProspectsView } from './ProspectsView';
import { ClientsView, SeasonView } from './SeasonView';
import { SejourPanel } from './SejourPanel';

const TABLEAUX: [number, string][] = [[1, 'Réservations'], [2, 'Check-in'], [3, 'Guides'], [4, 'Cuisine'], [5, 'Trajets aéroport']];

type View =
  | { kind: 'season' }
  | { kind: 'clients' }
  | { kind: 'prospects' }
  | { kind: 'client'; id: string | null }
  | { kind: 'sejour'; id: string | null; preset?: Rec };

export default function Dashboard() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<View>({ kind: 'season' });
  const [year, setYear] = useState(String(new Date().getFullYear() + (new Date().getMonth() >= 8 ? 1 : 0)));
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setData(await api<Data>('/api/admin/data'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  // Met à jour la copie locale après un enregistrement (pas de rechargement complet)
  const onSaved = useCallback((table: string, rec: Rec) => {
    setData(d => {
      if (!d) return d;
      const list = d.tables[table] ?? [];
      const i = list.findIndex(r => r.id === rec.id);
      const next = i >= 0 ? list.map(r => (r.id === rec.id ? { ...r, ...rec } : r)) : [...list, rec];
      return { ...d, tables: { ...d.tables, [table]: next } };
    });
  }, []);

  const years = useMemo(() => {
    const s = new Set<string>([year, String(new Date().getFullYear()), String(new Date().getFullYear() + 1)]);
    data?.tables['Séjour'].forEach(r => txt(r['Date de début']) && s.add(txt(r['Date de début']).slice(0, 4)));
    return [...s].sort();
  }, [data, year]);

  const [tabOpen, setTabOpen] = useState(false);
  const [tabSel, setTabSel] = useState<number[]>([1, 2, 3, 4, 5]);

  async function regenerate() {
    if (!tabSel.length) return setNotice('Choisissez au moins un tableau.');
    setNotice('');
    try {
      await action({ type: 'tableaux', annee: year, tableaux: tabSel });
      setTabOpen(false);
      setNotice(`Génération ${year} lancée (tableau${tabSel.length > 1 ? 'x' : ''} ${tabSel.join(', ')}) : à jour dans Google Drive › Tableaux d’ici une à deux minutes.`);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Erreur');
    }
  }

  const openClient = (id: string | null) => setView({ kind: 'client', id });
  const openSejour = (id: string | null, preset?: Rec) => setView({ kind: 'sejour', id, preset });
  const nouveaux = (data?.tables.Prospects ?? []).filter(p => !p['Statut prospect'] || p['Statut prospect'] === 'Nouveau').length;
  const tab = (k: 'season' | 'clients' | 'prospects', label: string) => (
    <button type="button" onClick={() => setView({ kind: k })}
      className={`rounded-md px-3 py-1.5 text-sm font-medium ${view.kind === k ? 'bg-white text-sky-800 shadow-sm' : 'text-sky-100 hover:bg-sky-700'}`}>
      {label}
    </button>
  );

  return (
    <div>
      <header className="bg-sky-800 text-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3">
          <h1 className="mr-4 font-semibold">Lapland · Admin</h1>
          <nav className="flex gap-1 rounded-lg bg-sky-900/40 p-1">
            {tab('season', 'Saison')}
            {tab('clients', 'Clients')}
            {tab('prospects', nouveaux ? `Prospects (${nouveaux})` : 'Prospects')}
          </nav>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <select className="rounded-md bg-sky-900/40 px-2 py-1.5 text-sm" value={year} onChange={e => setYear(e.target.value)}>
              {years.map(y => <option key={y} value={y} className="text-slate-800">{y}</option>)}
            </select>
            <button type="button" className="rounded-md bg-sky-900/40 px-3 py-1.5 text-sm hover:bg-sky-900" onClick={() => openSejour(null)}>+ Séjour</button>
            <button type="button" className="rounded-md bg-sky-900/40 px-3 py-1.5 text-sm hover:bg-sky-900" onClick={() => setTabOpen(o => !o)}>Générer les tableaux</button>
            <button type="button" className="rounded-md bg-sky-900/40 px-3 py-1.5 text-sm hover:bg-sky-900" disabled={loading} onClick={load}>{loading ? 'Chargement…' : 'Actualiser'}</button>
            {data?.user && <span className="text-xs text-sky-100" title={data.user.email}>{data.user.nom} · {data.user.role}</span>}
            <form method="post" action="/api/admin/logout"><button className="rounded-md px-3 py-1.5 text-sm hover:bg-sky-900">Déconnexion</button></form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl space-y-4 p-4">
        {tabOpen && (
          <div className="card space-y-3">
            <h2 className="font-semibold">Générer les tableaux de la saison {year}</h2>
            <div className="flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-1 font-medium">
                <input type="checkbox" checked={tabSel.length === TABLEAUX.length} onChange={e => setTabSel(e.target.checked ? TABLEAUX.map(t => t[0]) : [])} /> Tous
              </label>
              {TABLEAUX.map(([n, label]) => (
                <label key={n} className="flex items-center gap-1">
                  <input type="checkbox" checked={tabSel.includes(n)}
                    onChange={e => setTabSel(s => (e.target.checked ? [...s, n] : s.filter(x => x !== n)).sort())} /> {n}. {label}
                </label>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-light" onClick={() => setTabOpen(false)}>Annuler</button>
              <button type="button" className="btn" disabled={!tabSel.length} onClick={regenerate}>Générer ({tabSel.length})</button>
            </div>
          </div>
        )}
        {notice && <p className="rounded-md bg-sky-50 px-3 py-2 text-sm text-sky-900 ring-1 ring-sky-200">{notice}</p>}
        {error && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {error} <button type="button" className="underline" onClick={load}>Réessayer</button>
          </p>
        )}
        {!data && !error && <p className="text-sm text-slate-500">Chargement des données Airtable…</p>}
        {data && (view.kind === 'client' || view.kind === 'sejour') && (
          <button type="button" className="text-sm text-sky-700 hover:underline" onClick={() => setView({ kind: view.kind === 'client' ? 'clients' : 'season' })}>← Retour</button>
        )}
        {data && view.kind === 'season' && <SeasonView data={data} year={year} openSejour={openSejour} />}
        {data && view.kind === 'clients' && <ClientsView data={data} openClient={openClient} />}
        {data && view.kind === 'prospects' && <ProspectsView data={data} onSaved={onSaved} openSejour={openSejour} />}
        {data && view.kind === 'client' && (
          <ClientPanel key={view.id ?? 'new'} data={data} clientId={view.id} onSaved={onSaved} openClient={openClient} openSejour={openSejour} />
        )}
        {data && view.kind === 'sejour' && (
          <SejourPanel key={view.id ?? 'new'} data={data} sejourId={view.id} preset={view.preset} onSaved={onSaved} openSejour={id => openSejour(id)} openClient={openClient} />
        )}
      </main>
    </div>
  );
}
