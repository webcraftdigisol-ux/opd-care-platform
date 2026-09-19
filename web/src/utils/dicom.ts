import * as dicomParser from 'dicom-parser';

// This viewer intentionally covers only the common small-clinic case: a
// single uncompressed frame exported straight off a modality. Compressed
// transfer syntaxes (JPEG/JPEG2000/RLE) and multi-frame/3D series need a
// real decoder stack (e.g. cornerstone.js + its codec bundle), which is a
// much heavier dependency than this scoped feature justifies -- see the
// README's DICOM section for the full rationale.
const SUPPORTED_TRANSFER_SYNTAXES = new Set([
  '1.2.840.10008.1.2', // Implicit VR Little Endian
  '1.2.840.10008.1.2.1', // Explicit VR Little Endian
]);

export class UnsupportedDicomError extends Error {}

export interface ParsedDicomImage {
  rows: number;
  columns: number;
  bitsAllocated: number;
  pixelRepresentation: number; // 0 = unsigned, 1 = signed (two's complement)
  photometricInterpretation: string;
  rescaleSlope: number;
  rescaleIntercept: number;
  windowCenter?: number;
  windowWidth?: number;
  pixelData: Uint8Array | Uint16Array | Int16Array;
  patientName?: string;
  patientId?: string;
  modality?: string;
  studyDate?: string;
}

export function parseDicomFile(buffer: ArrayBuffer): ParsedDicomImage {
  const byteArray = new Uint8Array(buffer);
  let dataSet;
  try {
    dataSet = dicomParser.parseDicom(byteArray);
  } catch {
    throw new UnsupportedDicomError('Could not parse this file -- it does not look like a valid DICOM file');
  }

  // Group 0002 (File Meta Information) is always Explicit VR Little Endian
  // regardless of the main dataset's own transfer syntax, and dicom-parser
  // already accounts for that when parsing -- this read just tells us what
  // the REST of the file (the pixel data) is encoded as.
  const transferSyntax = dataSet.string('x00020010');
  if (!transferSyntax || !SUPPORTED_TRANSFER_SYNTAXES.has(transferSyntax)) {
    throw new UnsupportedDicomError(
      transferSyntax
        ? `Unsupported transfer syntax (${transferSyntax}) -- only uncompressed DICOM (Implicit or Explicit VR Little Endian) can be viewed here`
        : 'Missing transfer syntax -- this does not look like a standard DICOM Part 10 file',
    );
  }

  const numberOfFrames = dataSet.intString('x00280008');
  if (numberOfFrames && numberOfFrames > 1) {
    throw new UnsupportedDicomError('Multi-frame DICOM files are not supported -- only a single-frame image can be viewed here');
  }

  const samplesPerPixel = dataSet.uint16('x00280002') ?? 1;
  if (samplesPerPixel !== 1) {
    throw new UnsupportedDicomError('Only single-channel (grayscale) DICOM images are supported');
  }

  const rows = dataSet.uint16('x00280010');
  const columns = dataSet.uint16('x00280011');
  const bitsAllocated = dataSet.uint16('x00280100');
  if (!rows || !columns || !bitsAllocated) {
    throw new UnsupportedDicomError('Missing required image attributes (Rows, Columns, or BitsAllocated)');
  }
  if (bitsAllocated !== 8 && bitsAllocated !== 16) {
    throw new UnsupportedDicomError(`Unsupported BitsAllocated (${bitsAllocated}) -- only 8-bit and 16-bit pixel data is supported`);
  }

  const pixelDataElement = dataSet.elements.x7fe00010;
  if (!pixelDataElement) {
    throw new UnsupportedDicomError('This file has no pixel data to display');
  }

  const pixelRepresentation = dataSet.uint16('x00280103') ?? 0;
  const photometricInterpretation = dataSet.string('x00280004') ?? 'MONOCHROME2';
  const rescaleSlope = dataSet.floatString('x00281053') ?? 1;
  const rescaleIntercept = dataSet.floatString('x00281052') ?? 0;
  const windowCenter = dataSet.floatString('x00281050');
  const windowWidth = dataSet.floatString('x00281051');

  const rawBuffer = dataSet.byteArray.buffer;
  const rawByteOffset = dataSet.byteArray.byteOffset + pixelDataElement.dataOffset;
  let pixelData: Uint8Array | Uint16Array | Int16Array;
  if (bitsAllocated === 8) {
    pixelData = new Uint8Array(rawBuffer, rawByteOffset, pixelDataElement.length);
  } else {
    const numPixels = Math.floor(pixelDataElement.length / 2);
    pixelData =
      pixelRepresentation === 1
        ? new Int16Array(rawBuffer, rawByteOffset, numPixels)
        : new Uint16Array(rawBuffer, rawByteOffset, numPixels);
  }
  if (pixelData.length < rows * columns) {
    throw new UnsupportedDicomError('Pixel data is smaller than Rows x Columns -- the file may be truncated or corrupted');
  }

  return {
    rows,
    columns,
    bitsAllocated,
    pixelRepresentation,
    photometricInterpretation,
    rescaleSlope,
    rescaleIntercept,
    windowCenter,
    windowWidth,
    pixelData,
    patientName: dataSet.string('x00100010'),
    patientId: dataSet.string('x00100020'),
    modality: dataSet.string('x00080060'),
    studyDate: dataSet.string('x00080020'),
  };
}

export interface WindowingOptions {
  windowCenter: number;
  windowWidth: number;
  rescaleSlope: number;
  rescaleIntercept: number;
}

// Standard DICOM linear VOI LUT windowing: maps a raw stored pixel value to
// an 8-bit display value (0-255), clipping anything outside the window to
// black/white rather than spreading the full stored range (which for a
// 16-bit CT slice would make everything look mid-gray).
export function applyWindowing(rawValue: number, opts: WindowingOptions): number {
  const modalityValue = rawValue * opts.rescaleSlope + opts.rescaleIntercept;
  const { windowCenter, windowWidth } = opts;
  const width = windowWidth > 0 ? windowWidth : 1;
  const lower = windowCenter - width / 2;
  const upper = windowCenter + width / 2;
  if (modalityValue <= lower) return 0;
  if (modalityValue >= upper) return 255;
  return Math.round(((modalityValue - lower) / width) * 255);
}

// Used when the file carries no WindowCenter/WindowWidth (both are
// optional in the DICOM standard) -- a full-range window from the actual
// min/max modality values present in the image is the standard fallback.
export function computeDefaultWindow(
  pixelData: ArrayLike<number>,
  rescaleSlope: number,
  rescaleIntercept: number,
): { windowCenter: number; windowWidth: number } {
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < pixelData.length; i++) {
    const value = pixelData[i] * rescaleSlope + rescaleIntercept;
    if (value < min) min = value;
    if (value > max) max = value;
  }
  if (min === Infinity) {
    min = 0;
    max = 0;
  }
  return { windowCenter: (min + max) / 2, windowWidth: Math.max(max - min, 1) };
}

// Renders a parsed image into an already-sized canvas 2D context, applying
// windowing and MONOCHROME1 inversion (where stored intensity increases
// toward black, the opposite of the far more common MONOCHROME2).
export function renderToCanvas(ctx: CanvasRenderingContext2D, image: ParsedDicomImage, windowing: WindowingOptions): void {
  const { rows, columns, pixelData, photometricInterpretation } = image;
  const imageData = ctx.createImageData(columns, rows);
  const invert = photometricInterpretation === 'MONOCHROME1';
  for (let i = 0; i < rows * columns; i++) {
    let gray = applyWindowing(pixelData[i], windowing);
    if (invert) gray = 255 - gray;
    const offset = i * 4;
    imageData.data[offset] = gray;
    imageData.data[offset + 1] = gray;
    imageData.data[offset + 2] = gray;
    imageData.data[offset + 3] = 255;
  }
  ctx.putImageData(imageData, 0, 0);
}
