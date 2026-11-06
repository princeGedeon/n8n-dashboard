import { useMemo, useState, type ReactNode } from 'react';
import { clientName, norm, txt, type Rec } from './lib';

export function Field({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="label">{label}</span>
      {children}
    </label>
  );
}

export function TextInput({ value, onChange, missing, ...rest }: {
  value: unknown; onChange: (v: string) => void; missing?: boolean;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  return <input {...rest} className={`input ${missing ? 'input-missing' : ''}`} value={txt(value)} onChange={e => onChange(e.target.value)} />;
}

export function Select({ value, onChange, options, empty = '—', missing }: {
  value: unknown; onChange: (v: string) => void; options: (string | { value: string; label: string; disabled?: boolean })[]; empty?: string; missing?: boolean;
}) {
  return (
    <select className={`input ${missing ? 'input-missing' : ''}`} value={txt(value)} onChange={e => onChange(e.target.value)}>
      <option value="">{empty}</option>
      {options.map(o =>
        typeof o === 'string' ? <option key={o} value={o}>{o}</option> : <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>,
      )}
    </select>
  );
}

export function Pill({ tone, children }: { tone: 'ok' | 'warn' | 'bad' | 'info'; children: ReactNode }) {
  const c = { ok: 'bg-emerald-100 text-emerald-800', warn: 'bg-amber-100 text-amber-800', bad: 'bg-red-100 text-red-700', info: 'bg-slate-100 text-slate-700' }[tone];
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${c}`}>{children}</span>;
}

export const ratioTone = (done: number, total: number) => (total === 0 ? 'info' : done >= total ? 'ok' : done === 0 ? 'bad' : 'warn');

export function searchClients(clients: Rec[], query: string, limit = 50) {
  const q = norm(query);
  if (!q) return [];
  const words = q.split(/\s+/);
  return clients
    .filter(c => {
      const hay = norm([c.Prenom, c.Nom, c.Email, c.AutreEmail, c['Numéro de téléphone'], c['Clé primaire (Nom + Prénom)']].map(txt).join(' '));
      const phone = txt(c['Numéro de téléphone']).replace(/\D/g, '');
      return words.every(w => hay.includes(w) || (w.replace(/\D/g, '').length > 3 && phone.includes(w.replace(/\D/g, ''))));
    })
    .sort((a, b) => clientName(a).localeCompare(clientName(b)))
    .slice(0, limit);
}

// Sélection d'un ou plusieurs clients par recherche instantanée
export function ClientPicker({ clients, value, onChange, multiple = false, placeholder = 'Rechercher un client…' }: {
  clients: Rec[]; value: string[]; onChange: (ids: string[]) => void; multiple?: boolean; placeholder?: string;
}) {
  const [query, setQuery] = useState('');
  const byId = useMemo(() => Object.fromEntries(clients.map(c => [c.id, c])), [clients]);
  const results = useMemo(() => searchClients(clients, query, 8).filter(c => !value.includes(c.id)), [clients, query, value]);
  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {value.map(id => (
            <span key={id} className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-1 text-xs text-sky-900 ring-1 ring-sky-200">
              {clientName(byId[id])}
              <button type="button" className="text-sky-700 hover:text-red-600" onClick={() => onChange(value.filter(v => v !== id))} aria-label="Retirer">×</button>
            </span>
          ))}
        </div>
      )}
      {(multiple || value.length === 0) && (
        <div className="relative">
          <input className="input" value={query} placeholder={placeholder} onChange={e => setQuery(e.target.value)} />
          {results.length > 0 && (
            <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-md border border-slate-200 bg-white shadow-lg">
              {results.map(c => (
                <li key={c.id}>
                  <button type="button" className="block w-full px-3 py-2 text-left text-sm hover:bg-sky-50"
                    onClick={() => { onChange(multiple ? [...value, c.id] : [c.id]); setQuery(''); }}>
                    <span className="font-medium">{clientName(c)}</span>
                    <span className="ml-2 text-xs text-slate-500">{txt(c.Email)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
