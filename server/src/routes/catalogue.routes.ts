import { Router } from 'express';
import { z } from 'zod';
import type { CatalogKind as PrismaCatalogKind, DoctorCatalogItem as PrismaItem } from '@prisma/client';
import type { AddToListResult, CatalogSuggestions, DoctorCatalogItem } from '@opd/shared';
import { prisma } from '../prisma';
import { asyncHandler, HttpError } from '../middleware/errorHandler';
import { requireAuth, requireRole, type AuthedRequest } from '../middleware/auth';
import { starterFor } from '../utils/starterCatalog';
import { loadStandardCatalogue } from '../utils/standardLists';

// The Doctor's Catalogue: plain name lists the consultation screen
// suggests from, in every tier (see the DoctorCatalogItem model).
export const catalogueRouter = Router();

catalogueRouter.use(requireAuth);

const STAFF = ['ADMIN', 'DOCTOR', 'RECEPTIONIST', 'PHARMACIST', 'LAB_TECHNICIAN', 'RADIOLOGY_TECHNICIAN', 'NURSE', 'HEAD_NURSE'] as const;
const EDITORS = ['ADMIN', 'DOCTOR'] as const;

const kindSchema = z.enum(['MEDICINE', 'LAB_TEST', 'RADIOLOGY']);
const itemSchema = z.object({
  kind: kindSchema,
  name: z.string().trim().min(1, 'Name is required').max(200),
  strength: z
    .string()
    .max(50)
    .nullish()
    .transform((v) => v?.trim() || null),
  brands: z.array(z.string().max(80)).max(50).optional(),
});

// Trimmed, blanks dropped, duplicates (any case) removed, order kept.
export function cleanBrands(brands: string[] | undefined): string[] {
  const out: string[] = [];
  for (const b of brands ?? []) {
    const t = b.trim();
    if (t && !out.some((o) => o.toLowerCase() === t.toLowerCase())) out.push(t);
  }
  return out;
}

function toItem(i: PrismaItem): DoctorCatalogItem {
  return { id: i.id, kind: i.kind, name: i.name, strength: i.strength, brands: i.brands };
}

const sameKey = (a: { name: string; strength: string | null }, b: { name: string; strength: string | null }) =>
  a.name.toLowerCase() === b.name.toLowerCase() && (a.strength ?? '').toLowerCase() === (b.strength ?? '').toLowerCase();

async function assertNotDuplicate(clinicId: string, kind: PrismaCatalogKind, name: string, strength: string | null, exceptId?: string) {
  const existing = await prisma.doctorCatalogItem.findMany({
    where: { clinicId, kind, name: { equals: name, mode: 'insensitive' } },
  });
  if (existing.some((e) => e.id !== exceptId && sameKey(e, { name, strength }))) {
    throw new HttpError(409, `${name}${strength ? ` ${strength}` : ''} is already in the catalogue`);
  }
}

catalogueRouter.get(
  '/',
  requireRole(...STAFF),
  asyncHandler(async (req: AuthedRequest, res) => {
    const kind = req.query.kind ? kindSchema.parse(req.query.kind) : undefined;
    const items = await prisma.doctorCatalogItem.findMany({
      where: { clinicId: req.auth!.clinicId, ...(kind ? { kind } : {}) },
      orderBy: [{ name: 'asc' }, { strength: 'asc' }],
    });
    res.json(items.map(toItem));
  }),
);

// What the consultation screen suggests. From Tier 2 only the pharmacy's,
// lab's and radiology's own lists -- what the clinic actually sells and
// bills -- so every prescription and order matches a billable entry; a
// missing one is added to that list from the consultation (below). In
// Tier 1 the Doctor's Catalogue, backed by the standard list for the
// clinic's system of medicine (offered after the doctor's own).
catalogueRouter.get(
  '/suggestions',
  requireRole(...STAFF),
  asyncHandler(async (req: AuthedRequest, res) => {
    const clinicId = req.auth!.clinicId;
    const clinic = await prisma.clinic.findUniqueOrThrow({ where: { id: clinicId }, select: { tier: true, medicineSystem: true } });
    const byName = <T extends { name: string }>(a: T, b: T) => a.name.localeCompare(b.name);
    const uniqueNames = (names: string[]) => {
      const seen = new Map<string, string>();
      for (const n of names) if (!seen.has(n.toLowerCase())) seen.set(n.toLowerCase(), n);
      return [...seen.values()].sort((a, b) => a.localeCompare(b));
    };
    const group = (rows: { name: string; strength: string | null; brands: string[] }[]) => {
      const out: CatalogSuggestions['medicines'] = [];
      for (const m of rows) {
        const same = out.find((x) => sameKey(x, m));
        if (same) same.brands = cleanBrands([...same.brands, ...m.brands]);
        else out.push({ ...m, brands: cleanBrands(m.brands) });
      }
      return out.sort(byName);
    };

    if (clinic.tier >= 2) {
      const [pharmacy, lab, radiology] = await Promise.all([
        prisma.pharmacyItem.findMany({ where: { clinicId }, select: { name: true, strength: true, brand: true } }),
        prisma.labTestCatalog.findMany({ where: { clinicId }, select: { name: true } }),
        prisma.radiologyCatalog.findMany({ where: { clinicId }, select: { name: true } }),
      ]);
      const response: CatalogSuggestions = {
        source: 'DEPARTMENTS',
        medicines: group(pharmacy.map((p) => ({ name: p.name, strength: p.strength, brands: p.brand ? [p.brand] : [] }))),
        labTests: uniqueNames(lab.map((l) => l.name)),
        radiology: uniqueNames(radiology.map((r) => r.name)),
        standard: { medicines: [], labTests: [], radiology: [] },
      };
      res.json(response);
      return;
    }

    const items = await prisma.doctorCatalogItem.findMany({ where: { clinicId } });
    const medicines = group(items.filter((i) => i.kind === 'MEDICINE').map((i) => ({ name: i.name, strength: i.strength, brands: i.brands })));
    const labTests = uniqueNames(items.filter((i) => i.kind === 'LAB_TEST').map((i) => i.name));
    const radiologyTests = uniqueNames(items.filter((i) => i.kind === 'RADIOLOGY').map((i) => i.name));
    const starter = starterFor(clinic.medicineSystem);
    const missing = (own: string[], kind: PrismaCatalogKind) => {
      const have = new Set(own.map((n) => n.toLowerCase()));
      return starter.filter((i) => i.kind === kind && !have.has(i.name.toLowerCase())).map((i) => i.name);
    };
    const response: CatalogSuggestions = {
      source: 'CATALOGUE',
      medicines,
      labTests,
      radiology: radiologyTests,
      standard: {
        medicines: starter
          .filter((i) => i.kind === 'MEDICINE')
          .map((i) => ({ name: i.name, strength: i.strength ?? null, brands: i.brands ?? [] }))
          .filter((m) => !medicines.some((x) => sameKey(x, m))),
        labTests: missing(labTests, 'LAB_TEST'),
        radiology: missing(radiologyTests, 'RADIOLOGY'),
      },
    };
    res.json(response);
  }),
);

const addToListSchema = z.object({
  kind: kindSchema,
  name: z.string().trim().min(1, 'Name is required').max(200),
  strength: z.string().max(50).nullish().transform((v) => v?.trim() || null),
  brand: z.string().max(80).nullish().transform((v) => v?.trim() || null),
  // Optional: the department fills in or corrects the price later.
  price: z.number().nonnegative().optional(),
});

// A doctor adds a medicine or test that isn't in the list, from the
// consultation: from Tier 2 straight into the pharmacy's, lab's or
// radiology's own list (unpriced unless a price is given, and flagged at
// the counter until priced), so it's billable and suggested from then on;
// in Tier 1 into the Doctor's Catalogue. Already there -> returned as is.
catalogueRouter.post(
  '/add-to-list',
  requireRole(...EDITORS),
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = addToListSchema.parse(req.body);
    const clinicId = req.auth!.clinicId;
    const clinic = await prisma.clinic.findUniqueOrThrow({ where: { id: clinicId }, select: { tier: true } });
    const strength = data.kind === 'MEDICINE' ? data.strength : null;
    const brand = data.kind === 'MEDICINE' ? data.brand : null;
    const lower = (v: string | null) => (v ?? '').toLowerCase();
    const result: AddToListResult = { kind: data.kind, name: data.name, strength, brand, added: true, list: 'CATALOGUE' };

    if (clinic.tier < 2) {
      const same = (await prisma.doctorCatalogItem.findMany({ where: { clinicId, kind: data.kind, name: { equals: data.name, mode: 'insensitive' } } })).find((e) =>
        sameKey(e, { name: data.name, strength }),
      );
      if (same) {
        const brands = cleanBrands([...same.brands, ...(brand ? [brand] : [])]);
        result.added = brands.length > same.brands.length;
        if (result.added) await prisma.doctorCatalogItem.update({ where: { id: same.id }, data: { brands } });
        res.status(result.added ? 201 : 200).json({ ...result, name: same.name, strength: same.strength });
        return;
      }
      await prisma.doctorCatalogItem.create({ data: { clinicId, kind: data.kind, name: data.name, strength, brands: brand ? [brand] : [] } });
      res.status(201).json(result);
      return;
    }

    if (data.kind === 'MEDICINE') {
      result.list = 'PHARMACY';
      const same = (await prisma.pharmacyItem.findMany({ where: { clinicId, name: { equals: data.name, mode: 'insensitive' } } })).find(
        (p) => lower(p.strength) === lower(strength) && lower(p.brand) === lower(brand),
      );
      if (same) {
        res.json({ ...result, name: same.name, strength: same.strength, brand: same.brand, added: false });
        return;
      }
      await prisma.pharmacyItem.create({ data: { clinicId, name: data.name, strength, brand, pricePerUnit: data.price ?? 0, costPricePerUnit: 0, stockUnits: 0 } });
      res.status(201).json(result);
      return;
    }
    result.list = data.kind === 'LAB_TEST' ? 'LAB' : 'RADIOLOGY';
    const catalog = (data.kind === 'LAB_TEST' ? prisma.labTestCatalog : prisma.radiologyCatalog) as typeof prisma.labTestCatalog;
    const same = await catalog.findFirst({ where: { clinicId, name: { equals: data.name, mode: 'insensitive' } } });
    if (same) {
      res.json({ ...result, name: same.name, added: false });
      return;
    }
    await catalog.create({ data: { clinicId, name: data.name, price: data.price ?? 0 } });
    res.status(201).json(result);
  }),
);

catalogueRouter.post(
  '/',
  requireRole(...EDITORS),
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = itemSchema.parse(req.body);
    const clinicId = req.auth!.clinicId;
    // Strength only means something for a medicine.
    const strength = data.kind === 'MEDICINE' ? data.strength : null;
    await assertNotDuplicate(clinicId, data.kind, data.name, strength);
    const brands = data.kind === 'MEDICINE' ? cleanBrands(data.brands) : [];
    const item = await prisma.doctorCatalogItem.create({ data: { clinicId, kind: data.kind, name: data.name, strength, brands } });
    res.status(201).json(toItem(item));
  }),
);

catalogueRouter.post(
  '/starter',
  requireRole(...EDITORS),
  asyncHandler(async (req: AuthedRequest, res) => {
    res.json(await loadStandardCatalogue(req.auth!.clinicId));
  }),
);

async function findItem(req: AuthedRequest) {
  const item = await prisma.doctorCatalogItem.findFirst({ where: { id: req.params.id, clinicId: req.auth!.clinicId } });
  if (!item) throw new HttpError(404, 'Catalogue item not found');
  return item;
}

catalogueRouter.put(
  '/:id',
  requireRole(...EDITORS),
  asyncHandler(async (req: AuthedRequest, res) => {
    const item = await findItem(req);
    const data = itemSchema.parse({ ...req.body, kind: item.kind });
    const strength = item.kind === 'MEDICINE' ? data.strength : null;
    await assertNotDuplicate(item.clinicId, item.kind, data.name, strength, item.id);
    const updated = await prisma.doctorCatalogItem.update({
      where: { id: item.id },
      data: {
        name: data.name,
        strength,
        ...(item.kind === 'MEDICINE' && data.brands !== undefined ? { brands: cleanBrands(data.brands) } : {}),
      },
    });
    res.json(toItem(updated));
  }),
);

catalogueRouter.delete(
  '/:id',
  requireRole(...EDITORS),
  asyncHandler(async (req: AuthedRequest, res) => {
    const item = await findItem(req);
    await prisma.doctorCatalogItem.delete({ where: { id: item.id } });
    res.status(204).end();
  }),
);
