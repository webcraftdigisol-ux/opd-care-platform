import { useEffect, useRef, useState } from 'react';
import { fetchAttachmentArrayBuffer } from '../api/attachments';
import { computeDefaultWindow, parseDicomFile, renderToCanvas, UnsupportedDicomError, type ParsedDicomImage } from '../utils/dicom';
import type { Attachment } from '@opd/shared';

// A modal, not a new tab like openAttachment() -- a DICOM file needs to be
// parsed and rendered by this app, not just displayed by the browser, so it
// can't reuse the plain blob-open pattern the other attachment categories use.
export function DicomViewer({ attachment, onClose }: { attachment: Attachment; onClose: () => void }) {
  const [status, setStatus] = useState<'loading' | 'error' | 'ready'>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [image, setImage] = useState<ParsedDicomImage | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    fetchAttachmentArrayBuffer(attachment)
      .then((buffer) => {
        if (cancelled) return;
        const parsed = parseDicomFile(buffer);
        setImage(parsed);
        setStatus('ready');
      })
      .catch((err) => {
        if (cancelled) return;
        setErrorMessage(err instanceof UnsupportedDicomError ? err.message : 'Could not load this DICOM file');
        setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [attachment]);

  useEffect(() => {
    if (status !== 'ready' || !image || !canvasRef.current) return;
    const canvas = canvasRef.current;
    canvas.width = image.columns;
    canvas.height = image.rows;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const windowing =
      image.windowCenter !== undefined && image.windowWidth !== undefined
        ? { windowCenter: image.windowCenter, windowWidth: image.windowWidth, rescaleSlope: image.rescaleSlope, rescaleIntercept: image.rescaleIntercept }
        : { ...computeDefaultWindow(image.pixelData, image.rescaleSlope, image.rescaleIntercept), rescaleSlope: image.rescaleSlope, rescaleIntercept: image.rescaleIntercept };
    renderToCanvas(ctx, image, windowing);
  }, [status, image]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="max-h-full max-w-2xl overflow-auto rounded-lg bg-white p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-medium text-gray-800">{attachment.fileName}</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-gray-600">
            ×
          </button>
        </div>

        {status === 'loading' && <p className="py-8 text-center text-sm text-gray-400">Loading DICOM image…</p>}
        {status === 'error' && (
          <p data-testid="dicom-viewer-error" className="py-8 text-center text-sm text-red-600">
            {errorMessage}
          </p>
        )}
        {status === 'ready' && image && (
          <div>
            <canvas ref={canvasRef} data-testid="dicom-canvas" className="mx-auto max-w-full border border-gray-200" />
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-500">
              {image.patientName && (
                <>
                  <dt className="font-medium">Patient</dt>
                  <dd>{image.patientName}</dd>
                </>
              )}
              {image.modality && (
                <>
                  <dt className="font-medium">Modality</dt>
                  <dd>{image.modality}</dd>
                </>
              )}
              <dt className="font-medium">Dimensions</dt>
              <dd>
                {image.columns} × {image.rows}
              </dd>
            </dl>
          </div>
        )}
      </div>
    </div>
  );
}
