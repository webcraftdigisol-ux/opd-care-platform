import { prisma } from '../prisma';
import { HttpError } from '../middleware/errorHandler';

interface TransferLike {
  fromBedId: string | null;
  toBedId: string;
  transferredAt: Date;
}

interface RoomSegment {
  bedId: string;
  days: number;
  dailyRate: number;
  amount: number;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function makeSegment(bedId: string, from: Date, to: Date, bedRates: Map<string, number>): RoomSegment {
  const ms = Math.max(0, to.getTime() - from.getTime());
  const days = Math.max(1, Math.ceil(ms / MS_PER_DAY));
  const dailyRate = bedRates.get(bedId) ?? 0;
  return { bedId, days, dailyRate, amount: days * dailyRate };
}

// A patient may move rooms mid-stay, each at a different daily rate, so room
// charges are computed per occupied-bed segment rather than a single
// admission-to-discharge span at one rate.
export function computeRoomCharges(
  admittedAt: Date,
  currentBedId: string,
  transfers: TransferLike[],
  endTime: Date,
  bedRates: Map<string, number>,
): number {
  const sorted = [...transfers].sort((a, b) => a.transferredAt.getTime() - b.transferredAt.getTime());
  const segments: RoomSegment[] = [];

  let segmentStart = admittedAt;
  let segmentBedId = sorted.length > 0 ? (sorted[0].fromBedId ?? currentBedId) : currentBedId;

  for (const transfer of sorted) {
    segments.push(makeSegment(segmentBedId, segmentStart, transfer.transferredAt, bedRates));
    segmentStart = transfer.transferredAt;
    segmentBedId = transfer.toBedId;
  }
  segments.push(makeSegment(segmentBedId, segmentStart, endTime, bedRates));

  return segments.reduce((sum, seg) => sum + seg.amount, 0);
}

export interface IpdBillFigures {
  roomCharges: number;
  doctorVisitCharges: number;
  procedureCharges: number;
  medicationCharges: number;
  adHocCharges: number;
  pharmacyCharges: number;
  labCharges: number;
  subtotal: number;
  taxPercent: number;
  taxAmount: number;
  total: number;
  depositAmount: number;
  amountDue: number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// Computes the discharge bill from every charge source. Pharmacy/lab totals
// are each already tax-inclusive (their own sale/invoice tax), so only the
// non-pharmacy/lab subtotal gets the clinic's tax rate applied here — never
// double-taxing the same rupee twice.
export async function computeIpdBillFigures(
  clinicId: string,
  admissionId: string,
  endTime: Date,
): Promise<IpdBillFigures> {
  const admission = await prisma.admission.findFirst({
    where: { id: admissionId, clinicId },
    include: {
      roomTransfers: true,
      doctorVisits: true,
      procedures: true,
      medications: true,
      charges: true,
      pharmacySales: true,
      labInvoices: true,
    },
  });
  if (!admission) throw new HttpError(404, 'Admission not found');

  const bedIds = new Set<string>([admission.bedId, ...admission.roomTransfers.flatMap((t) => [t.fromBedId, t.toBedId].filter((id): id is string => !!id))]);
  const beds = await prisma.bed.findMany({ where: { id: { in: [...bedIds] } } });
  const bedRates = new Map(beds.map((b) => [b.id, b.dailyRate]));

  const roomCharges = computeRoomCharges(admission.admittedAt, admission.bedId, admission.roomTransfers, endTime, bedRates);
  const doctorVisitCharges = admission.doctorVisits.reduce((s, v) => s + v.fee, 0);
  const procedureCharges = admission.procedures.reduce((s, p) => s + p.fee, 0);
  const medicationCharges = admission.medications.reduce(
    (s, m) => s + (m.source === 'CLINIC_SUPPLIED' ? m.quantity * m.unitPrice : 0),
    0,
  );
  const adHocCharges = admission.charges.reduce((s, c) => s + c.amount, 0);
  const pharmacyCharges = admission.pharmacySales.reduce((s, sale) => s + sale.total, 0);
  const labCharges = admission.labInvoices.reduce((s, inv) => s + inv.total, 0);

  const subtotal = roomCharges + doctorVisitCharges + procedureCharges + medicationCharges + adHocCharges;
  const clinic = await prisma.clinic.findUniqueOrThrow({ where: { id: clinicId } });
  const taxAmount = round2(subtotal * (clinic.taxPercent / 100));
  const total = round2(subtotal + taxAmount + pharmacyCharges + labCharges);
  const amountDue = round2(total - admission.depositAmount);

  return {
    roomCharges: round2(roomCharges),
    doctorVisitCharges: round2(doctorVisitCharges),
    procedureCharges: round2(procedureCharges),
    medicationCharges: round2(medicationCharges),
    adHocCharges: round2(adHocCharges),
    pharmacyCharges: round2(pharmacyCharges),
    labCharges: round2(labCharges),
    subtotal: round2(subtotal),
    taxPercent: clinic.taxPercent,
    taxAmount,
    total,
    depositAmount: admission.depositAmount,
    amountDue,
  };
}
