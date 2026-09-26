import type { MedicineSystem } from '@prisma/client';
import { prisma } from '../prisma';
import { starterFor } from './starterCatalog';

// Loading the standard lists, for the clinic's system of medicine. Each
// skips what's already there, so running it again only adds what's new.
// Used by the lists' "Load standard list" buttons and at registration.

const lower = (s: string | null | undefined) => (s ?? '').trim().toLowerCase();
const cleanBrands = (brands: string[]) => {
  const out: string[] = [];
  for (const b of brands) if (b.trim() && !out.some((o) => lower(o) === lower(b))) out.push(b.trim());
  return out;
};

async function systemOf(clinicId: string): Promise<MedicineSystem> {
  return (await prisma.clinic.findUniqueOrThrow({ where: { id: clinicId }, select: { medicineSystem: true } })).medicineSystem;
}

// The Doctor's Catalogue (Tier 1): medicines, lab tests and imaging. An
// existing medicine only gets the brands it doesn't have yet.
export async function loadStandardCatalogue(clinicId: string): Promise<{ added: number; brandsAdded: number }> {
  const [system, existing] = await Promise.all([systemOf(clinicId), prisma.doctorCatalogItem.findMany({ where: { clinicId } })]);
  const key = (kind: string, name: string, strength: string | null | undefined) => `${kind}|${lower(name)}|${lower(strength)}`;
  const byKey = new Map(existing.map((e) => [key(e.kind, e.name, e.strength), e]));
  const toAdd: { kind: 'MEDICINE' | 'LAB_TEST' | 'RADIOLOGY'; name: string; strength: string | null; brands: string[] }[] = [];
  const updates = new Map<string, string[]>();
  let brandsAdded = 0;
  for (const s of starterFor(system)) {
    const k = key(s.kind, s.name, s.strength);
    const match = byKey.get(k);
    if (!match) {
      if (!toAdd.some((t) => key(t.kind, t.name, t.strength) === k)) toAdd.push({ kind: s.kind, name: s.name, strength: s.strength ?? null, brands: s.brands ?? [] });
      continue;
    }
    const before = updates.get(match.id) ?? match.brands;
    const merged = cleanBrands([...before, ...(s.brands ?? [])]);
    if (merged.length > before.length) {
      brandsAdded += merged.length - before.length;
      updates.set(match.id, merged);
    }
  }
  await prisma.$transaction([
    prisma.doctorCatalogItem.createMany({ data: toAdd.map((t) => ({ ...t, clinicId })) }),
    ...[...updates].map(([id, brands]) => prisma.doctorCatalogItem.update({ where: { id }, data: { brands } })),
  ]);
  return { added: toAdd.length, brandsAdded };
}

// The pharmacy's medicine list: one row per brand (plus anything the
// clinic's doctors put in their catalogue), unpriced.
export async function loadStandardMedicines(clinicId: string): Promise<number> {
  const [system, existing, doctorItems] = await Promise.all([
    systemOf(clinicId),
    prisma.pharmacyItem.findMany({ where: { clinicId }, select: { name: true, strength: true, brand: true } }),
    prisma.doctorCatalogItem.findMany({ where: { clinicId, kind: 'MEDICINE' } }),
  ]);
  const key = (r: { name: string; strength: string | null; brand: string | null }) => `${lower(r.name)}|${lower(r.strength)}|${lower(r.brand)}`;
  const seen = new Set(existing.map(key));
  const toAdd: { name: string; strength: string | null; brand: string | null }[] = [];
  const sources = [
    ...starterFor(system).filter((s) => s.kind === 'MEDICINE').map((s) => ({ name: s.name, strength: s.strength ?? null, brands: s.brands ?? [] })),
    ...doctorItems.map((d) => ({ name: d.name, strength: d.strength, brands: d.brands })),
  ];
  for (const s of sources) {
    for (const brand of s.brands.length ? s.brands : [null]) {
      const row = { name: s.name, strength: s.strength, brand };
      if (seen.has(key(row))) continue;
      seen.add(key(row));
      toAdd.push(row);
    }
  }
  await prisma.pharmacyItem.createMany({ data: toAdd.map((r) => ({ ...r, clinicId, pricePerUnit: 0, costPricePerUnit: 0, stockUnits: 0 })) });
  return toAdd.length;
}

// The lab's or radiology's test list (plus the doctors' own), unpriced.
export async function loadStandardTests(clinicId: string, kind: 'LAB_TEST' | 'RADIOLOGY'): Promise<number> {
  // The two catalogues have identical shapes.
  const catalog = (kind === 'LAB_TEST' ? prisma.labTestCatalog : prisma.radiologyCatalog) as typeof prisma.labTestCatalog;
  const [system, existing, doctorItems] = await Promise.all([
    systemOf(clinicId),
    catalog.findMany({ where: { clinicId }, select: { name: true } }),
    prisma.doctorCatalogItem.findMany({ where: { clinicId, kind }, select: { name: true } }),
  ]);
  const seen = new Set(existing.map((e) => lower(e.name)));
  const toAdd: string[] = [];
  for (const name of [...starterFor(system).filter((s) => s.kind === kind).map((s) => s.name), ...doctorItems.map((d) => d.name)]) {
    if (seen.has(lower(name))) continue;
    seen.add(lower(name));
    toAdd.push(name);
  }
  await catalog.createMany({ data: toAdd.map((name) => ({ clinicId, name, price: 0 })) });
  return toAdd.length;
}
