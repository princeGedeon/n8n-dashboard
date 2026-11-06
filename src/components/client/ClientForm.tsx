import { useEffect, useRef, useState } from 'react';

// Formulaire public : le client renseigne uniquement SES informations et le séjour souhaité.
// Les autres personnes du groupe sont ajoutées par l'admin.
type ClientInfo = {
  prenom: string; nom: string; email: string; telephone: string; regime: string; taille: string; moucheur: boolean;
  adresse: string; codePostal: string; ville: string; pays: string;
};

const STEPS = ['Vos informations', 'Séjour souhaité', 'Envoi'];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const SOURCES = ['Bouche-à-oreille', 'Recherche Google / Internet', 'Réseaux sociaux', 'Salon / événement', 'Déjà venu(e)', 'Magazine / presse', 'Autre'];

declare global {
  interface Window { turnstile?: { render: (el: HTMLElement, opts: Record<string, unknown>) => string; reset: (id?: string) => void } }
}

function Input({ label, value, onChange, type = 'text', required = false, ...rest }: {
  label: string; value: string | number; onChange: (v: string) => void; type?: string; required?: boolean;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  return (
    <label className="block">
      <span className="label">{label}{required && <span className="text-red-600"> *</span>}</span>
      <input className="input" type={type} value={value} required={required} onChange={e => onChange(e.target.value)} {...rest} />
    </label>
  );
}

export default function ClientForm({ formules, turnstileSiteKey }: { formules: string[]; turnstileSiteKey: string }) {
  const [step, setStep] = useState(0);
  const [client, setClient] = useState<ClientInfo>({
    prenom: '', nom: '', email: '', telephone: '', regime: '', taille: '', moucheur: false, adresse: '', codePostal: '', ville: '', pays: '',
  });
  const [sejour, setSejour] = useState({ debut: '', fin: '', formule: '', nbPecheurs: 1, nbAccompagnants: 0, attentes: '', vols: '', source: '' });
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState('');
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const captchaRef = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const minDate = new Date().toISOString().slice(0, 10);
  const LAST = STEPS.length - 1;

  useEffect(() => {
    if (step !== LAST || !turnstileSiteKey || widgetId.current) return;
    const timer = setInterval(() => {
      if (window.turnstile && captchaRef.current) {
        clearInterval(timer);
        widgetId.current = window.turnstile.render(captchaRef.current, {
          sitekey: turnstileSiteKey, callback: (t: string) => setToken(t), 'expired-callback': () => setToken(''),
        });
      }
    }, 200);
    return () => clearInterval(timer);
  }, [step, turnstileSiteKey, LAST]);

  const setC = (k: keyof ClientInfo) => (v: string | boolean) => setClient(c => ({ ...c, [k]: v }));
  const setS = (k: keyof typeof sejour) => (v: string) =>
    setSejour(s => ({ ...s, [k]: k === 'nbPecheurs' || k === 'nbAccompagnants' ? Number(v) : v }));

  function validate(s: number): string {
    if (s === 0) {
      if (!client.prenom.trim() || !client.nom.trim()) return 'Prénom et nom obligatoires.';
      if (!EMAIL.test(client.email.trim())) return 'Email invalide.';
      if (!client.telephone.trim()) return 'Téléphone obligatoire.';
    }
    if (s === 1) {
      if (!sejour.debut || !sejour.fin) return 'Indiquez vos dates d’arrivée et de départ.';
      if (sejour.debut < minDate) return 'La date d’arrivée est passée.';
      if (sejour.fin < sejour.debut) return 'La date de départ est avant la date d’arrivée.';
    }
    return '';
  }

  function next() {
    const e = validate(step);
    setError(e);
    if (!e) setStep(s => s + 1);
  }

  async function submit() {
    for (const s of [0, 1]) {
      const e = validate(s);
      if (e) { setStep(s); return setError(e); }
    }
    if (!consent) return setError('Merci d’accepter l’utilisation de vos données pour traiter la demande.');
    if (turnstileSiteKey && !token) return setError('Merci de valider la vérification anti-robot.');
    setSending(true);
    setError('');
    try {
      const res = await fetch('/api/client', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client, sejour, consent, website, turnstileToken: token }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Envoi impossible, réessayez.');
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Envoi impossible.');
      if (widgetId.current) window.turnstile?.reset(widgetId.current);
      setToken('');
    } finally {
      setSending(false);
    }
  }

  if (done) {
    return (
      <div className="card space-y-2 text-center">
        <h2 className="text-lg font-semibold text-emerald-800">Merci, votre demande est bien envoyée !</h2>
        <p className="text-sm text-slate-600">Nous vous contactons rapidement pour confirmer le séjour et compléter les informations de votre groupe.</p>
      </div>
    );
  }

  return (
    <div className="card space-y-6">
      <ol className="flex gap-2 text-xs">
        {STEPS.map((label, i) => (
          <li key={label} className={`flex-1 rounded-full px-2 py-1 text-center ${i === step ? 'bg-sky-700 text-white' : i < step ? 'bg-sky-100 text-sky-800' : 'bg-slate-100 text-slate-500'}`}>
            {i + 1}. {label}
          </li>
        ))}
      </ol>

      {/* Champ piège invisible pour les robots */}
      <input type="text" name="website" value={website} onChange={e => setWebsite(e.target.value)} tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />

      {step === 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Prénom" value={client.prenom} onChange={setC('prenom')} required autoComplete="given-name" />
          <Input label="Nom" value={client.nom} onChange={setC('nom')} required autoComplete="family-name" />
          <Input label="Email" type="email" value={client.email} onChange={setC('email')} required autoComplete="email" />
          <Input label="Téléphone" type="tel" value={client.telephone} onChange={setC('telephone')} required autoComplete="tel" />
          <Input label="Adresse" value={client.adresse} onChange={setC('adresse')} autoComplete="street-address" />
          <Input label="Code postal" value={client.codePostal} onChange={setC('codePostal')} autoComplete="postal-code" />
          <Input label="Ville" value={client.ville} onChange={setC('ville')} autoComplete="address-level2" />
          <Input label="Pays" value={client.pays} onChange={setC('pays')} autoComplete="country-name" />
          <Input label="Régime alimentaire / allergies" value={client.regime} onChange={setC('regime')} placeholder="ex. sans gluten, aucun" />
          <Input label="Taille (vêtements / waders)" value={client.taille} onChange={setC('taille')} placeholder="ex. L / 43" />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={client.moucheur} onChange={e => setC('moucheur')(e.target.checked)} /> Je pêche à la mouche
          </label>
        </div>
      )}

      {step === 1 && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Date d’arrivée souhaitée" type="date" min={minDate} value={sejour.debut} onChange={setS('debut')} required />
          <Input label="Date de départ souhaitée" type="date" min={sejour.debut || minDate} value={sejour.fin} onChange={setS('fin')} required />
          <label className="block">
            <span className="label">Formule</span>
            <select className="input" value={sejour.formule} onChange={e => setS('formule')(e.target.value)}>
              <option value="">Je ne sais pas encore</option>
              {formules.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Pêcheurs (vous compris)" type="number" min={1} max={30} value={sejour.nbPecheurs} onChange={setS('nbPecheurs')} />
            <Input label="Accompagnants (non pêcheurs)" type="number" min={0} max={30} value={sejour.nbAccompagnants} onChange={setS('nbAccompagnants')} />
          </div>
          <label className="block sm:col-span-2">
            <span className="label">Vos attentes (techniques, espèces, niveau…)</span>
            <textarea className="input min-h-24" maxLength={2000} value={sejour.attentes} onChange={e => setS('attentes')(e.target.value)} />
          </label>
          <label className="block sm:col-span-2">
            <span className="label">Vols (si déjà connus : aéroport, date, heure)</span>
            <textarea className="input min-h-16" maxLength={1000} value={sejour.vols} onChange={e => setS('vols')(e.target.value)} />
          </label>
          <label className="block sm:col-span-2">
            <span className="label">Comment nous avez-vous connus ?</span>
            <select className="input" value={sejour.source} onChange={e => setS('source')(e.target.value)}>
              <option value="">—</option>
              {SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
        </div>
      )}

      {step === LAST && (
        <div className="space-y-4 text-sm">
          <div className="rounded-md bg-slate-50 p-3">
            <p><strong>{client.prenom} {client.nom}</strong> · {client.email} · {client.telephone}</p>
            <p>
              Séjour du {sejour.debut || '?'} au {sejour.fin || '?'} · {sejour.formule || 'formule à définir'} · {sejour.nbPecheurs} pêcheur(s)
              {sejour.nbAccompagnants > 0 && ` + ${sejour.nbAccompagnants} accompagnant(s)`}
            </p>
          </div>
          <label className="flex items-start gap-2">
            <input type="checkbox" className="mt-1" checked={consent} onChange={e => setConsent(e.target.checked)} />
            <span>J’accepte que ces informations soient utilisées pour traiter ma demande de réservation et organiser le séjour.</span>
          </label>
          {turnstileSiteKey && <div ref={captchaRef} />}
        </div>
      )}

      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p>}

      <div className="flex justify-between">
        <button type="button" className="btn-light" disabled={step === 0 || sending} onClick={() => { setError(''); setStep(s => s - 1); }}>Retour</button>
        {step < LAST
          ? <button type="button" className="btn" onClick={next}>Continuer</button>
          : <button type="button" className="btn" disabled={sending} onClick={submit}>{sending ? 'Envoi…' : 'Envoyer ma demande'}</button>}
      </div>
    </div>
  );
}
