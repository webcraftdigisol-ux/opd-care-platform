// Shared name-matching used by the Pharmacy/Lab counter auto-match and by
// the Reports "Total ordered" valuation. Exact case-insensitive match wins;
// otherwise a substring match either direction. Always a best-effort
// convenience — callers must keep a free-text/unmatched path available.
export function findBestNameMatch<T extends { name: string }>(candidates: T[], name: string): T | null {
  const needle = name.trim().toLowerCase();
  if (!needle) return null;

  const exact = candidates.find((c) => c.name.trim().toLowerCase() === needle);
  if (exact) return exact;

  return (
    candidates.find((c) => {
      const candidateName = c.name.trim().toLowerCase();
      return candidateName.includes(needle) || needle.includes(candidateName);
    }) ?? null
  );
}
