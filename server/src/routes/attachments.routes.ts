import path from 'path';
import { pipeline } from 'stream';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma';
import { toAttachment } from '../utils/serialize';
import { upload, UPLOADS_ROOT, fileStorage, deleteUploadedFile } from '../utils/uploads';
import { asyncHandler, HttpError } from '../middleware/errorHandler';
import { requireAuth, requireRole, type AuthedRequest } from '../middleware/auth';
import type { AttachmentCategory } from '@opd/shared';

export const attachmentsRouter = Router();

attachmentsRouter.use(requireAuth);

// Who may attach a file under each category -- mirrors exactly who already
// produces that content elsewhere in the API (Lab Technician records lab
// results, Radiology Technician records radiology results, a doctor writes
// prescriptions). Reading is much broader (see the routes below): any
// clinic staff member, since these are read-only clinical documents rather
// than something needing the same tight per-module write gate.
const WRITE_ROLES_BY_CATEGORY: Record<AttachmentCategory, string[]> = {
  LAB_REPORT: ['ADMIN', 'LAB_TECHNICIAN'],
  RADIOLOGY_REPORT: ['ADMIN', 'RADIOLOGY_TECHNICIAN'],
  PRESCRIPTION_SCAN: ['ADMIN', 'DOCTOR'],
  RADIOLOGY_DICOM: ['ADMIN', 'RADIOLOGY_TECHNICIAN'],
};

// entityId is polymorphic on category, same pattern as Payment.billId in
// payments.routes.ts -- this is the one place that resolves it, so a
// category's meaning can't drift between the upload/list/download routes.
async function loadOwnerPatientId(clinicId: string, category: AttachmentCategory, entityId: string): Promise<string> {
  switch (category) {
    case 'LAB_REPORT': {
      const invoice = await prisma.labInvoice.findFirst({ where: { id: entityId, clinicId } });
      if (!invoice) throw new HttpError(404, 'Lab invoice not found');
      return invoice.patientId;
    }
    case 'RADIOLOGY_REPORT':
    case 'RADIOLOGY_DICOM': {
      const invoice = await prisma.radiologyInvoice.findFirst({ where: { id: entityId, clinicId } });
      if (!invoice) throw new HttpError(404, 'Radiology invoice not found');
      return invoice.patientId;
    }
    case 'PRESCRIPTION_SCAN': {
      const consultation = await prisma.consultation.findFirst({
        where: { id: entityId, appointment: { clinicId } },
        include: { appointment: true },
      });
      if (!consultation) throw new HttpError(404, 'Consultation not found');
      return consultation.appointment.patientId;
    }
  }
}

const ATTACHMENT_CATEGORIES = ['LAB_REPORT', 'RADIOLOGY_REPORT', 'PRESCRIPTION_SCAN', 'RADIOLOGY_DICOM'] as const;

const uploadBodySchema = z.object({
  category: z.enum(ATTACHMENT_CATEGORIES),
  entityId: z.string().min(1),
});

attachmentsRouter.post(
  '/',
  upload.single('file'),
  asyncHandler(async (req: AuthedRequest, res) => {
    if (!req.file) throw new HttpError(400, 'No file uploaded (field name must be "file")');
    // multer's diskStorage has already written the file by this point --
    // any validation failure from here on must clean it up rather than
    // leave an orphaned file with no DB record pointing at it.
    const storageKey = path.relative(UPLOADS_ROOT, req.file.path);
    try {
      const data = uploadBodySchema.parse(req.body);
      if (!WRITE_ROLES_BY_CATEGORY[data.category].includes(req.auth!.role)) {
        throw new HttpError(403, 'Insufficient permissions to upload this category of attachment');
      }
      const clinicId = req.auth!.clinicId;
      const patientId = await loadOwnerPatientId(clinicId, data.category, data.entityId);

      // The browser's reported mimetype for a DICOM upload is unreliable
      // (see uploads.ts's isDicomFile) -- normalize what gets stored so
      // every downstream consumer (the download route's Content-Type
      // header, the web viewer's "is this a DICOM attachment" check) can
      // trust a consistent value instead of re-deriving it from the
      // filename every time.
      const mimeType = data.category === 'RADIOLOGY_DICOM' ? 'application/dicom' : req.file.mimetype;
      await fileStorage.persist(req.file.path, storageKey, mimeType, req.file.size);

      const attachment = await prisma.attachment.create({
        data: {
          clinicId,
          patientId,
          category: data.category,
          entityId: data.entityId,
          fileName: req.file.originalname,
          mimeType,
          sizeBytes: req.file.size,
          storageKey,
          uploadedById: req.auth!.userId,
        },
        include: { uploadedBy: true },
      });
      res.status(201).json(toAttachment(attachment));
    } catch (err) {
      await deleteUploadedFile(storageKey);
      throw err;
    }
  }),
);

const listQuerySchema = z.object({
  category: z.enum(ATTACHMENT_CATEGORIES),
  entityId: z.string().min(1),
});

attachmentsRouter.get(
  '/',
  asyncHandler(async (req: AuthedRequest, res) => {
    const query = listQuerySchema.parse(req.query);
    const clinicId = req.auth!.clinicId;
    const patientId = await loadOwnerPatientId(clinicId, query.category, query.entityId);
    if (req.auth!.role === 'PATIENT' && req.auth!.userId !== patientId) {
      throw new HttpError(403, 'Not authorized to view these attachments');
    }

    const attachments = await prisma.attachment.findMany({
      where: { clinicId, category: query.category, entityId: query.entityId },
      include: { uploadedBy: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json(attachments.map(toAttachment));
  }),
);

attachmentsRouter.get(
  '/:id/download',
  asyncHandler(async (req: AuthedRequest, res) => {
    const attachment = await prisma.attachment.findFirst({
      where: { id: req.params.id, clinicId: req.auth!.clinicId },
    });
    if (!attachment) throw new HttpError(404, 'Attachment not found');
    if (req.auth!.role === 'PATIENT' && req.auth!.userId !== attachment.patientId) {
      throw new HttpError(403, 'Not authorized to view this attachment');
    }

    const body = await fileStorage.open(attachment.storageKey);
    res.setHeader('Content-Type', attachment.mimeType);
    res.setHeader('Content-Length', String(attachment.sizeBytes));
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(attachment.fileName)}"`);
    // pipeline, not pipe: it also tears down the source (an open S3
    // response) if the client disconnects mid-download.
    pipeline(body, res, (err: NodeJS.ErrnoException | null) => {
      if (err && err.code !== 'ERR_STREAM_PREMATURE_CLOSE') {
        console.error(`Failed streaming attachment ${attachment.id}:`, err);
      }
    });
  }),
);

attachmentsRouter.delete(
  '/:id',
  requireRole('ADMIN'),
  asyncHandler(async (req: AuthedRequest, res) => {
    const attachment = await prisma.attachment.findFirst({
      where: { id: req.params.id, clinicId: req.auth!.clinicId },
    });
    if (!attachment) throw new HttpError(404, 'Attachment not found');
    await prisma.attachment.delete({ where: { id: attachment.id } });
    await deleteUploadedFile(attachment.storageKey);
    res.status(204).send();
  }),
);
