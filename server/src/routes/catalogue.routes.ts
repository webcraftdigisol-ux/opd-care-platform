import { Router } from 'express';
import { z } from 'zod';
import type { CatalogKind as PrismaCatalogKind, DoctorCatalogItem as PrismaItem } from '@prisma/client';
import type { CatalogSuggestions, DoctorCatalogItem } from '@opd/shared';
import { prisma } from '../prisma';
import { asyncHandler, HttpError } from '../middleware/errorHandler';
import { requireAuth, requireRole, type AuthedRequest } from '../middleware/auth';
import { STARTER_CATALOG } from '../utils/starterCatalog';

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
});

function toItem(i: PrismaItem): DoctorCatalogItem {
  return { id: i.id, kind: i.kind, name: i.name, strength: i.strength };
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

// Everything the consultation screen should suggest: the Doctor's
// Catalogue, plus the Tier 2+ department catalogues (medicine names, lab
// and radiology tests) so a clinic that upgrades keeps one list to type from.
catalogueRouter.get(
  '/suggestions',
  requireRole(...STAFF),
  asyncHandler(async (req: AuthedRequest, res) => {
    const clinicId = req.auth!.clinicId;
    const clinic = await prisma.clinic.findUniqueOrThrow({ where: { id: clinicId }, select: { tier: true } });
    const withDepartments = clinic.tier >= 2;
    const [items, pharmacy, lab, radiology] = await Promise.all([
      prisma.doctorCatalogItem.findMany({ where: { clinicId }, orderBy: [{ name: 'asc' }, { strength: 'asc' }] }),
      withDepartments ? prisma.pharmacyItem.findMany({ where: { clinicId }, select: { name: true } }) : [],
      withDepartments ? prisma.labTestCatalog.findMany({ where: { clinicId }, select: { name: true } }) : [],
      withDepartments ? prisma.radiologyCatalog.findMany({ where: { clinicId }, select: { name: true } }) : [],
    ]);

    const medicines: CatalogSuggestions['medicines'] = [];
    for (const m of [
      ...items.filter((i) => i.kind === 'MEDICINE').map((i) => ({ name: i.name, strength: i.strength })),
      ...pharmacy.map((p) => ({ name: p.name, strength: null })),
    ]) {
      if (!medicines.some((x) => sameKey(x, m))) medicines.push(m);
    }
    const names = (kind: PrismaCatalogKind, extra: { name: string }[]) => {
      const seen = new Map<string, string>();
      for (const n of [...items.filter((i) => i.kind === kind), ...extra].map((i) => i.name)) {
        if (!seen.has(n.toLowerCase())) seen.set(n.toLowerCase(), n);
      }
      return [...seen.values()].sort((a, b) => a.localeCompare(b));
    };
    const response: CatalogSuggestions = {
      medicines: medicines.sort((a, b) => a.name.localeCompare(b.name)),
      labTests: names('LAB_TEST', lab),
      radiology: names('RADIOLOGY', radiology),
    };
    res.json(response);
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
    const item = await prisma.doctorCatalogItem.create({ data: { clinicId, kind: data.kind, name: data.name, strength } });
    res.status(201).json(toItem(item));
  }),
);

catalogueRouter.post(
  '/starter',
  requireRole(...EDITORS),
  asyncHandler(async (req: AuthedRequest, res) => {
    const clinicId = req.auth!.clinicId;
    const existing = await prisma.doctorCatalogItem.findMany({ where: { clinicId } });
    const toAdd = STARTER_CATALOG.filter(
      (s) => !existing.some((e) => e.kind === s.kind && sameKey(e, { name: s.name, strength: s.strength ?? null })),
    );
    await prisma.doctorCatalogItem.createMany({
      data: toAdd.map((s) => ({ clinicId, kind: s.kind, name: s.name, strength: s.strength ?? null })),
    });
    res.json({ added: toAdd.length });
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
    const updated = await prisma.doctorCatalogItem.update({ where: { id: item.id }, data: { name: data.name, strength } });
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
