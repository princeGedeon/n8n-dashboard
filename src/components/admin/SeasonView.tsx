import { useMemo, useState } from 'react';
import { byId, clientName, euro, findAssoc, findCompta, first, frDate, num, people, totalAcompte, txt, type Data, type Rec } from './lib';
import { Pill, ratioTone, searchClients } from './ui';

export function SeasonView({ data, year, openSejour }: { data: Data; year: string; openSejour: (id: string | null) => void }) {
  const { tables } = data;
  const clients = useMemo(() => byId(tables.Clients), [tables.Clients]);
  const rows = useMemo(
    () => tables['Séjour']
      .filter(s => txt(s['Date de début']).startsWith(year))
      .sort((a, b) => txt(a['Date de début']).localeCompare(txt(b['Date de début'])))
      .map(s => {
        const ps = people(s);
        const comptas = ps.map(p => findCompta(tables, s.id, p.id)).filter(Boolean) as Rec[];
        return {
          s,
          ps,
          compta: comptas.length,
          signe: comptas.filter(c => c['Contrat signé']).length,
          mail: comptas.filter(c => c['Mail confirmation']).length,
          logement: ps.filter(p => findAssoc(tables, 'logement', s.id, p.id)).length,
          guide: ps.filter(p => p.role !== 'Accompagnant' && findAssoc(tables, 'guide', s.id, p.id)).length,
          pecheurs: ps.filter(p => p.role !== 'Accompagnant').length,
          ca: comptas.reduce((n, c) => n + num(c['Tarif individuel']), 0),
          acomptes: comptas.reduce((n, c) => n + totalAcompte(c), 0),
        };
      }),
    [tables, year],
  );
  const tot = rows.reduce((t, r) => ({ ca: t.ca + r.ca, acomptes: t.acomptes + r.acomptes, pers: t.pers + r.ps.length }), { ca: 0, acomptes: 0, pers: 0 });

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <Kpi label="Séjours" value={String(rows.length)} />
        <Kpi label="Personnes" value={String(tot.pers)} />
        <Kpi label="CA (tarifs)" value={euro(tot.ca)} />
        <Kpi label="TotalAcompte versé" value={euro(tot.acomptes)} />
      </div>
      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-left text-xs text-slate-600">
            <tr>
              <th className="p-2">Dates</th><th className="p-2">Chef de groupe</th><th className="p-2">Pers.</th><th className="p-2">Statut</th>
              <th className="p-2">Compta</th><th className="p-2">Mail conf.</th><th className="p-2">Contrat signé</th><th className="p-2">Chambre</th><th className="p-2">Guide</th>
              <th className="p-2 text-right">CA</th><th className="p-2 text-right">TotalAcompte</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={11} className="p-4 text-center text-slate-500">Aucun séjour en {year}.</td></tr>}
            {rows.map(r => (
              <tr key={r.s.id} className="cursor-pointer border-t border-slate-100 hover:bg-sky-50" onClick={() => openSejour(r.s.id)}>
                <td className="p-2 whitespace-nowrap">{frDate(r.s['Date de début'])} → {frDate(r.s['Date de fin'])}</td>
                <td className="p-2 font-medium">{clientName(clients[first(r.s['Chef de groupe']) ?? ''])}</td>
                <td className="p-2">{r.ps.length}</td>
                <td className="p-2"><Pill tone={r.s.Status === 'Active' ? 'ok' : r.s.Status === 'Attente' ? 'warn' : 'info'}>{txt(r.s.Status) || '—'}</Pill></td>
                <td className="p-2"><Pill tone={ratioTone(r.compta, r.ps.length)}>{r.compta}/{r.ps.length}</Pill></td>
                <td className="p-2"><Pill tone={ratioTone(r.mail, r.ps.length)}>{r.mail}/{r.ps.length}</Pill></td>
                <td className="p-2"><Pill tone={ratioTone(r.signe, r.ps.length)}>{r.signe}/{r.ps.length}</Pill></td>
                <td className="p-2"><Pill tone={ratioTone(r.logement, r.ps.length)}>{r.logement}/{r.ps.length}</Pill></td>
                <td className="p-2"><Pill tone={ratioTone(r.guide, r.pecheurs)}>{r.guide}/{r.pecheurs}</Pill></td>
                <td className="p-2 text-right">{euro(r.ca)}</td>
                <td className="p-2 text-right">{euro(r.acomptes)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="card">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-xl font-semibold">{value}</p>
    </div>
  );
}

export function ClientsView({ data, openClient }: { data: Data; openClient: (id: string | null) => void }) {
  const [query, setQuery] = useState('');
  const results = useMemo(() => searchClients(data.tables.Clients, query, 50), [data.tables.Clients, query]);
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input className="input" autoFocus placeholder={`Rechercher parmi ${data.tables.Clients.length} clients (nom, email, téléphone)…`} value={query} onChange={e => setQuery(e.target.value)} />
        <button type="button" className="btn whitespace-nowrap" onClick={() => openClient(null)}>+ Nouveau client</button>
      </div>
      {query && results.length === 0 && (
        <div className="card text-sm">
          Aucun client trouvé. <button type="button" className="text-sky-700 underline" onClick={() => openClient(null)}>Créer un nouveau client</button>
        </div>
      )}
      {results.length > 0 && (
        <ul className="card divide-y divide-slate-100 p-0">
          {results.map(c => (
            <li key={c.id}>
              <button type="button" className="flex w-full flex-wrap items-center gap-x-3 px-4 py-2 text-left text-sm hover:bg-sky-50" onClick={() => openClient(c.id)}>
                <span className="font-medium">{clientName(c)}</span>
                <span className="text-slate-500">{txt(c.Email)}</span>
                <span className="text-slate-500">{txt(c['Numéro de téléphone'])}</span>
                {(!txt(c.Email) || !txt(c['Numéro de téléphone'])) && <Pill tone="warn">incomplet</Pill>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
