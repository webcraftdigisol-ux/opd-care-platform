import fs from 'fs';
import path from 'path';
import type { Readable } from 'stream';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { HttpError } from '../middleware/errorHandler';

// Where an accepted upload's bytes finally live. multer always writes the
// incoming file to local disk first (UPLOADS_ROOT/<clinicId>/<uuid>.<ext>,
// see uploads.ts); storageKey is that path relative to UPLOADS_ROOT, and is
// the same key in either backend:
//
// - Local disk (default): the multer-written file *is* the stored file.
//   Used for dev, tests and CI, which have no bucket.
// - S3 (when UPLOADS_S3_BUCKET is set): the file is copied to
//   s3://<bucket>/<storageKey> and the local copy removed, so uploads
//   survive the loss of the app server's disk. The bucket stays private --
//   reads still go through the authenticated download route, which streams
//   the object back, rather than handing out bucket URLs.
export interface FileStorage {
  // Called once the upload has passed every check and is about to be
  // recorded in the DB.
  persist(localPath: string, storageKey: string, mimeType: string, sizeBytes: number): Promise<void>;
  // Throws a 404 HttpError if the stored file is missing.
  open(storageKey: string): Promise<Readable>;
  // Best-effort: a missing file shouldn't block deleting the DB record
  // that references it.
  remove(storageKey: string): Promise<void>;
}

async function unlinkQuietly(absolute: string): Promise<void> {
  try {
    await fs.promises.unlink(absolute);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.error(`Failed to delete uploaded file ${absolute}:`, err);
    }
  }
}

export function createLocalStorage(root: string): FileStorage {
  const absolute = (storageKey: string) => path.join(root, storageKey);
  return {
    async persist() {
      // multer already wrote the file to its final place under root.
    },
    async open(storageKey) {
      const file = absolute(storageKey);
      if (!fs.existsSync(file)) throw new HttpError(404, 'The stored file is missing');
      return fs.createReadStream(file);
    },
    async remove(storageKey) {
      await unlinkQuietly(absolute(storageKey));
    },
  };
}

// Takes the client rather than building it, so tests can pass a fake.
export function createS3Storage(client: Pick<S3Client, 'send'>, bucket: string, stagingRoot: string): FileStorage {
  return {
    async persist(localPath, storageKey, mimeType, sizeBytes) {
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: storageKey,
          // Read whole rather than streamed: uploads are capped at 25MB
          // (uploads.ts), and a lazily-opened stream that the request never
          // consumed (e.g. the call failed first) would linger as an open fd.
          Body: await fs.promises.readFile(localPath),
          ContentLength: sizeBytes,
          ContentType: mimeType,
          ServerSideEncryption: 'AES256',
        }),
      );
      await unlinkQuietly(localPath);
    },
    async open(storageKey) {
      try {
        const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: storageKey }));
        return res.Body as Readable;
      } catch (err) {
        const name = (err as { name?: string }).name;
        if (name === 'NoSuchKey' || name === 'NotFound') throw new HttpError(404, 'The stored file is missing');
        throw err;
      }
    },
    async remove(storageKey) {
      // Also clears the local staging copy, for a failed upload that never
      // reached persist().
      await unlinkQuietly(path.join(stagingRoot, storageKey));
      try {
        await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: storageKey }));
      } catch (err) {
        console.error(`Failed to delete s3://${bucket}/${storageKey}:`, err);
      }
    },
  };
}

export function createFileStorage(uploadsRoot: string): FileStorage {
  const bucket = process.env.UPLOADS_S3_BUCKET;
  if (!bucket) return createLocalStorage(uploadsRoot);
  // Credentials come from the SDK's default chain -- on EC2, the instance
  // role; no keys in .env.
  const client = new S3Client({ region: process.env.AWS_REGION || 'ap-south-1' });
  return createS3Storage(client, bucket, uploadsRoot);
}
