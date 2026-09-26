// CORS_ORIGIN is a comma-separated list of allowed web origins. An entry
// may use one leading "*." for a single subdomain label, so each clinic's
// own address (https://anandi.ohmscare.in) is allowed by one entry:
//   CORS_ORIGIN="https://app.ohmscare.in,https://*.ohmscare.in"
// Unset means any origin (local development).
export function corsOrigins(value: string | undefined): '*' | (string | RegExp)[] {
  if (!value?.trim()) return '*';
  return value
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean)
    .map((o) => {
      const m = /^(https?:\/\/)\*\.(.+)$/.exec(o);
      if (!m) return o;
      const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(`^${escape(m[1]!)}[a-z0-9-]+\\.${escape(m[2]!)}$`);
    });
}
