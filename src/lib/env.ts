// Variables d'environnement lues à l'exécution (jamais intégrées au build)
export function env(name: string): string {
  const v = process.env[name] ?? (import.meta.env.DEV ? (import.meta.env as Record<string, string | undefined>)[name] : undefined);
  return (v ?? '').trim();
}

export function requireEnv(name: string): string {
  const v = env(name);
  if (!v) throw new Error(`Variable d'environnement manquante : ${name}`);
  return v;
}
