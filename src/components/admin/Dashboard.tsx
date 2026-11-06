import { useCallback, useEffect, useMemo, useState } from 'react';
import { ClientPanel } from './ClientPanel';
import { api, txt, type Data, type Rec } from './lib';
import { ClientsView, SeasonView } from './SeasonView';
import { SejourPanel } from './SejourPanel';

type View =
  | { kind: 'season' }
  | { kind: 'clients' }
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

  async function regenerate() {
    if (!confirm(`Régénérer les fichiers Excel de la saison ${year} ? (les fichiers existants sont remplacés)`)) return;
    setNotice('');
    try {
      await api('/api/admin/regenerate', { annee: year });
      setNotice(`Régénération ${year} lancée : les fichiers seront à jour dans Google Drive d’ici une à deux minutes.`);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Erreur');
    }
  }

  const openClient = (id: string | null) => setView({ kind: 'client', id });
  const openSejour = (id: string | null, preset?: Rec) => setView({ kind: 'sejour', id, preset });
  const tab = (k: 'season' | 'clients', label: string) => (
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
          </nav>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <select className="rounded-md bg-sky-900/40 px-2 py-1.5 text-sm" value={year} onChange={e => setYear(e.target.value)}>
              {years.map(y => <option key={y} value={y} className="text-slate-800">{y}</option>)}
            </select>
            <button type="button" className="rounded-md bg-sky-900/40 px-3 py-1.5 text-sm hover:bg-sky-900" onClick={() => openSejour(null)}>+ Séjour</button>
            <button type="button" className="rounded-md bg-sky-900/40 px-3 py-1.5 text-sm hover:bg-sky-900" onClick={regenerate}>Régénérer les Excel</button>
            <button type="button" className="rounded-md bg-sky-900/40 px-3 py-1.5 text-sm hover:bg-sky-900" disabled={loading} onClick={load}>{loading ? 'Chargement…' : 'Actualiser'}</button>
            <form method="post" action="/api/admin/logout"><button className="rounded-md px-3 py-1.5 text-sm hover:bg-sky-900">Déconnexion</button></form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl space-y-4 p-4">
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
