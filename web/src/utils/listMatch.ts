import type { CatalogSuggestionLists } from '@opd/shared';

const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase();

// Whether a prescribed medicine is an entry of the list: same name and
// strength, and -- when a brand is given -- one of that entry's brands.
export function medicineInList(
  medicines: CatalogSuggestionLists['medicines'],
  rx: { medicine: string; strength?: string | null; brand?: string | null },
): boolean {
  return medicines.some(
    (m) =>
      norm(m.name) === norm(rx.medicine) &&
      norm(m.strength) === norm(rx.strength) &&
      (!norm(rx.brand) || m.brands.some((b) => norm(b) === norm(rx.brand))),
  );
}

export function testInList(names: string[], testName: string): boolean {
  return names.some((n) => norm(n) === norm(testName));
}

// Everything on the consultation that isn't in its list, for the check
// before saving (Tier 2+, where only listed items can be billed).
export function unlistedItems(
  lists: CatalogSuggestionLists,
  rx: { medicine: string; strength?: string | null; brand?: string | null }[],
  lab: { testName: string }[],
  radiology: { testName: string }[],
): string[] {
  return [
    ...rx
      .filter((r) => r.medicine.trim() && !medicineInList(lists.medicines, r))
      .map((r) => [r.brand, r.medicine, r.strength].filter((x) => x?.trim()).join(' ')),
    ...lab.filter((o) => o.testName.trim() && !testInList(lists.labTests, o.testName)).map((o) => o.testName.trim()),
    ...radiology.filter((o) => o.testName.trim() && !testInList(lists.radiology, o.testName)).map((o) => o.testName.trim()),
  ];
}
