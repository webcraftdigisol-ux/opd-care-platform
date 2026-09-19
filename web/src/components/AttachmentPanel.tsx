import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { deleteAttachment, listAttachments, openAttachment, uploadAttachment } from '../api/attachments';
import { useAuth } from '../context/AuthContext';
import { DicomViewer } from './DicomViewer';
import type { Attachment, AttachmentCategory } from '@opd/shared';

// Self-contained, like PaymentRecorder: fetches its own list and owns its
// own upload/delete mutations, so a page just drops it in with a category +
// entityId rather than wiring react-query itself.
export function AttachmentPanel({
  category,
  entityId,
  label,
}: {
  category: AttachmentCategory;
  entityId: string;
  label: string;
}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const queryKey = ['attachments', category, entityId];
  const { data } = useQuery({ queryKey, queryFn: () => listAttachments(category, entityId) });
  const [error, setError] = useState<string | null>(null);
  const [viewingDicom, setViewingDicom] = useState<Attachment | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isDicomCategory = category === 'RADIOLOGY_DICOM';

  const uploadMutation = useMutation({
    mutationFn: (file: File) => uploadAttachment(category, entityId, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      setError(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    },
    onError: (err: any) => setError(err.response?.data?.message ?? 'Could not upload file'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteAttachment(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) uploadMutation.mutate(file);
  }

  const canDelete = user?.role === 'ADMIN';

  return (
    <div className="mt-3 rounded-md bg-gray-50 p-3 text-sm" data-testid={`attachment-panel-${category}`}>
      <p className="mb-2 font-medium text-gray-700">{label}</p>
      {data && data.length === 0 && <p className="text-gray-400">No files attached yet.</p>}
      <ul className="space-y-1">
        {data?.map((a) => (
          <li key={a.id} data-testid="attachment-item" className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => (isDicomCategory ? setViewingDicom(a) : openAttachment(a))}
              className="truncate text-teal hover:underline"
            >
              {a.fileName}
            </button>
            <span className="shrink-0 text-xs text-gray-400">{(a.sizeBytes / 1024).toFixed(0)} KB</span>
            {canDelete && (
              <button
                type="button"
                onClick={() => deleteMutation.mutate(a.id)}
                className="shrink-0 text-red-400 hover:text-red-600"
                aria-label={`Delete ${a.fileName}`}
              >
                ×
              </button>
            )}
          </li>
        ))}
      </ul>
      <div className="mt-2">
        <input
          ref={fileInputRef}
          data-testid="attachment-file-input"
          type="file"
          accept={isDicomCategory ? '.dcm,application/dicom' : 'application/pdf,image/jpeg,image/png,image/webp'}
          onChange={handleFileChange}
          disabled={uploadMutation.isPending}
          className="text-xs"
        />
        {uploadMutation.isPending && <p className="mt-1 text-xs text-gray-400">Uploading…</p>}
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </div>
      {viewingDicom && <DicomViewer attachment={viewingDicom} onClose={() => setViewingDicom(null)} />}
    </div>
  );
}
