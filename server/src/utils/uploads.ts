import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { HttpError } from '../middleware/errorHandler';

// Local disk, not S3 -- this deployment's own architecture is a single EC2
// instance (see deploy/README.md), so there's no multi-instance fan-out
// problem a shared filesystem would break. Would need S3 (or an EFS mount)
// the moment this ever scaled to more than one app server.
export const UPLOADS_ROOT = path.resolve(process.env.UPLOADS_ROOT || path.join(__dirname, '..', '..', 'uploads'));

const ALLOWED_MIME_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

const EXTENSION_BY_MIME: Record<string, string> = {
  'application/pdf': '.pdf',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

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
  filename: (_req, file, cb) => {
    // Never derive the on-disk name from the client-supplied original
    // filename -- a generated uuid + an extension we control from the
    // validated mime type sidesteps path traversal and collisions entirely.
    // The original filename is kept only as display metadata in the DB.
    const ext = EXTENSION_BY_MIME[file.mimetype] ?? '';
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});

export const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      cb(new HttpError(400, 'Unsupported file type -- only PDF, JPEG, PNG, and WebP are accepted'));
      return;
    }
    cb(null, true);
  },
});

export function absolutePathFor(storageKey: string): string {
  return path.join(UPLOADS_ROOT, storageKey);
}

export function deleteUploadedFile(storageKey: string): void {
  const absolute = absolutePathFor(storageKey);
  fs.unlink(absolute, (err) => {
    // Best-effort: a missing file on disk shouldn't block deleting the DB
    // record that references it.
    if (err && err.code !== 'ENOENT') {
      console.error(`Failed to delete uploaded file ${absolute}:`, err);
    }
  });
}
