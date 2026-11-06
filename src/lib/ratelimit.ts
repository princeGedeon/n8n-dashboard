// Limiteur simple en mémoire (un seul conteneur) : n tentatives par fenêtre et par clé
const buckets = new Map<string, number[]>();

const recent = (key: string, windowMs: number) => {
  const now = Date.now();
  const hits = (buckets.get(key) ?? []).filter(t => now - t < windowMs);
  buckets.set(key, hits);
  if (buckets.size > 5000) for (const [k, v] of buckets) if (!v.some(t => now - t < windowMs)) buckets.delete(k);
  return hits;
};

export function rateLimit(key: string, max: number, windowMs: number): boolean {
  const hits = recent(key, windowMs);
  if (hits.length >= max) return false;
  hits.push(Date.now());
  return true;
}

// Variante pour la connexion : seules les tentatives échouées comptent
export const isBlocked = (key: string, max: number, windowMs: number) => recent(key, windowMs).length >= max;
export const recordFailure = (key: string) => buckets.set(key, [...(buckets.get(key) ?? []), Date.now()]);
export const clearFailures = (key: string) => buckets.delete(key);

export function clientIp(request: Request, fallback: string): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0].trim() || request.headers.get('x-real-ip') || fallback;
}
