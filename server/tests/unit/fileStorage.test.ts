import fs from 'fs';
import os from 'os';
import path from 'path';
import { Readable } from 'stream';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { createLocalStorage, createS3Storage } from '../../src/utils/fileStorage';

async function readAll(stream: Readable): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString();
}

function stageFile(root: string, storageKey: string, contents: string): string {
  const file = path.join(root, storageKey);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, contents);
  return file;
}

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'opd-storage-'));
});
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('createLocalStorage', () => {
  it('keeps the multer-written file in place, reads it back, and removes it', async () => {
    const storage = createLocalStorage(root);
    const file = stageFile(root, 'clinic-1/a.pdf', 'hello');

    await storage.persist(file, 'clinic-1/a.pdf', 'application/pdf', 5);
    expect(fs.existsSync(file)).toBe(true);
    expect(await readAll(await storage.open('clinic-1/a.pdf'))).toBe('hello');

    await storage.remove('clinic-1/a.pdf');
    expect(fs.existsSync(file)).toBe(false);
  });

  it('404s on a missing file and ignores removing one', async () => {
    const storage = createLocalStorage(root);
    await expect(storage.open('clinic-1/missing.pdf')).rejects.toMatchObject({ status: 404 });
    await expect(storage.remove('clinic-1/missing.pdf')).resolves.toBeUndefined();
  });
});

describe('createS3Storage', () => {
  function fakeClient(handler: (cmd: unknown) => unknown = () => ({})) {
    const sent: unknown[] = [];
    return {
      sent,
      client: {
        send: jest.fn(async (cmd: unknown) => {
          sent.push(cmd);
          return handler(cmd);
        }),
      } as any,
    };
  }

  it('uploads to the bucket under the storage key, encrypted, then deletes the staged copy', async () => {
    const { client, sent } = fakeClient();
    const storage = createS3Storage(client, 'uploads-bucket', root);
    const file = stageFile(root, 'clinic-1/a.pdf', 'hello');

    await storage.persist(file, 'clinic-1/a.pdf', 'application/pdf', 5);

    expect(sent).toHaveLength(1);
    const put = sent[0] as PutObjectCommand;
    expect(put).toBeInstanceOf(PutObjectCommand);
    expect(put.input).toMatchObject({
      Bucket: 'uploads-bucket',
      Key: 'clinic-1/a.pdf',
      ContentType: 'application/pdf',
      ContentLength: 5,
      ServerSideEncryption: 'AES256',
    });
    expect(fs.existsSync(file)).toBe(false);
  });

  it('keeps the staged copy if the upload fails, so the caller can clean it up', async () => {
    const { client } = fakeClient(() => {
      throw new Error('AccessDenied');
    });
    const storage = createS3Storage(client, 'uploads-bucket', root);
    const file = stageFile(root, 'clinic-1/a.pdf', 'hello');

    await expect(storage.persist(file, 'clinic-1/a.pdf', 'application/pdf', 5)).rejects.toThrow('AccessDenied');
    expect(fs.existsSync(file)).toBe(true);

    await storage.remove('clinic-1/a.pdf');
    expect(fs.existsSync(file)).toBe(false);
  });

  it('streams an object back, and turns NoSuchKey into a 404', async () => {
    const { client } = fakeClient((cmd) => {
      const key = (cmd as GetObjectCommand).input.Key;
      if (key === 'clinic-1/a.pdf') return { Body: Readable.from(['hello']) };
      throw Object.assign(new Error('missing'), { name: 'NoSuchKey' });
    });
    const storage = createS3Storage(client, 'uploads-bucket', root);

    expect(await readAll(await storage.open('clinic-1/a.pdf'))).toBe('hello');
    await expect(storage.open('clinic-1/gone.pdf')).rejects.toMatchObject({ status: 404 });
  });

  it('deletes the object, and a delete failure does not throw', async () => {
    const { client, sent } = fakeClient(() => {
      throw new Error('boom');
    });
    const storage = createS3Storage(client, 'uploads-bucket', root);
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    await expect(storage.remove('clinic-1/a.pdf')).resolves.toBeUndefined();
    const del = sent[0] as DeleteObjectCommand;
    expect(del).toBeInstanceOf(DeleteObjectCommand);
    expect(del.input).toEqual({ Bucket: 'uploads-bucket', Key: 'clinic-1/a.pdf' });
    errorSpy.mockRestore();
  });
});
