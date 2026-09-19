import { apiClient } from './client';
import type { Attachment, AttachmentCategory } from '@opd/shared';

export async function listAttachments(category: AttachmentCategory, entityId: string): Promise<Attachment[]> {
  const res = await apiClient.get<Attachment[]>('/attachments', { params: { category, entityId } });
  return res.data;
}

export async function uploadAttachment(
  category: AttachmentCategory,
  entityId: string,
  file: File,
): Promise<Attachment> {
  const form = new FormData();
  form.append('category', category);
  form.append('entityId', entityId);
  form.append('file', file);
  const res = await apiClient.post<Attachment>('/attachments', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data;
}

// A plain <a href> can't carry the Authorization header a download needs,
// so this fetches the file as a blob through the authenticated apiClient
// and opens it from an object URL instead -- the standard SPA pattern for
// an auth-gated download.
export async function openAttachment(attachment: Attachment): Promise<void> {
  const res = await apiClient.get(`/attachments/${attachment.id}/download`, { responseType: 'blob' });
  const url = URL.createObjectURL(res.data as Blob);
  window.open(url, '_blank');
  // Give the new tab time to actually load the blob before revoking it.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export async function deleteAttachment(id: string): Promise<void> {
  await apiClient.delete(`/attachments/${id}`);
}
