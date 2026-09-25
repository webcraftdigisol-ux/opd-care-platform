import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { HttpError } from '../middleware/errorHandler';
import { createFileStorage } from './fileStorage';

// Where multer writes each incoming file. With UPLOADS_S3_BUCKET unset this
// is also where files are stored for good; with it set, it's only a staging
// area and accepted files move to S3 (see fileStorage.ts).
export const UPLOADS_ROOT = path.resolve(process.env.UPLOADS_ROOT || path.join(__dirname, '..', '..', 'uploads'));

export const fileStorage = createFileStorage(UPLOADS_ROOT);

const ALLOWED_MIME_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);
// DICOM exports run larger than a typical scanned report (a single
// uncompressed slice/frame is commonly several MB), so this category gets a
// higher ceiling than everything else. Multer's fileSize limit is one value
// per instance, not per field, so this is the shared ceiling for every
// category -- raising it only for RADIOLOGY_DICOM would need a second
// multer instance for one route, which isn't worth the duplication for a
// single shared limit.
const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25MB

const EXTENSION_BY_MIME: Record<string, string> = {
  'application/pdf': '.pdf',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

// Browsers have no standard, reliably-reported MIME type for DICOM --
// file.mimetype for a .dcm upload commonly comes through as
// application/octet-stream or empty, not application/dicom. The .dcm
// extension is the practical signal every DICOM-aware tool actually relies
// on, so uploads.ts checks category + extension for this one category
// rather than trusting the browser's mimetype guess the way every other
// category does.
function isDicomFile(file: Express.Multer.File): boolean {
  return file.mimetype === 'application/dicom' || file.originalname.toLowerCase().endsWith('.dcm');
}

// Both fileFilter and the filename callback below read req.body.category --
// that's only populated here because the web/mobile upload clients always
// send the "category" field before the "file" field in the multipart
// stream (see web/src/api/attachments.ts), and multer parses multipart
// fields in stream order. If a future client ever sent the file first,
// category-aware validation would silently stop applying -- worth knowing
// if this ever needs to move to a more robust (but heavier) two-phase
// upload.
function categoryFromRequest(req: unknown): string | undefined {
  return (req as { body?: { category?: string } })?.body?.category;
}

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    // clinicId comes from the verified JWT, never from client input, so this
    // can't be steered outside the uploads root the way a client-supplied
    // path segment could.
    const clinicId = (req as any).auth?.clinicId ?? 'unknown-clinic';
    const dir = path.join(UPLOADS_ROOT, clinicId);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    // Never derive the on-disk name from the client-supplied original
    // filename -- a generated uuid + an extension we control sidesteps
    // path traversal and collisions entirely. The original filename is
    // kept only as display metadata in the DB. DICOM gets a forced .dcm
    // extension rather than one derived from file.mimetype, since that
    // mimetype is unreliable for this category (see isDicomFile above).
    const ext = categoryFromRequest(req) === 'RADIOLOGY_DICOM' ? '.dcm' : (EXTENSION_BY_MIME[file.mimetype] ?? '');
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});

export const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE_BYTES, files: 1 },
  fileFilter: (req, file, cb) => {
    const isDicomUpload = categoryFromRequest(req) === 'RADIOLOGY_DICOM';
    if (isDicomUpload) {
      if (!isDicomFile(file)) {
        cb(new HttpError(400, 'Unsupported file -- only a .dcm DICOM file is accepted for this category'));
        return;
      }
    } else if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      cb(new HttpError(400, 'Unsupported file type -- only PDF, JPEG, PNG, and WebP are accepted'));
      return;
    }
    cb(null, true);
  },
});

export function absolutePathFor(storageKey: string): string {
  return path.join(UPLOADS_ROOT, storageKey);
}

export function deleteUploadedFile(storageKey: string): Promise<void> {
  return fileStorage.remove(storageKey);
}
