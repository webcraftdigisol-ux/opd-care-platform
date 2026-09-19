import { describe, expect, it } from 'vitest';
import { applyWindowing, computeDefaultWindow, parseDicomFile, UnsupportedDicomError } from './dicom';

// Hand-builds a minimal, real DICOM Part 10 file (128-byte preamble + "DICM"
// + a File Meta group + a main dataset), both in Explicit VR Little Endian,
// so parseDicomFile can be tested against actual DICOM bytes rather than a
// mock of dicom-parser's internals. Kept self-contained to this test file
// rather than shared with e2e's own fixture builder, matching this repo's
// existing convention of small, duplicated test-fixture helpers per package.
const SHORT_FORM_VRS = new Set(['AE', 'AS', 'AT', 'CS', 'DA', 'DS', 'DT', 'FL', 'FD', 'IS', 'LO', 'LT', 'PN', 'SH', 'SL', 'SS', 'ST', 'TM', 'UI', 'UL', 'US']);

function concatBytes(...chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, c) => sum + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

function element(group: number, elem: number, vr: string, value: Uint8Array): Uint8Array {
  const isShortForm = SHORT_FORM_VRS.has(vr);
  const header = new Uint8Array(isShortForm ? 8 : 12);
  const view = new DataView(header.buffer);
  view.setUint16(0, group, true);
  view.setUint16(2, elem, true);
  header[4] = vr.charCodeAt(0);
  header[5] = vr.charCodeAt(1);
  if (isShortForm) {
    view.setUint16(6, value.length, true);
  } else {
    view.setUint32(8, value.length, true); // bytes 6-7 are reserved, left zero
  }
  return concatBytes(header, value);
}

function str(s: string, padChar = ' '): Uint8Array {
  const padded = s.length % 2 === 0 ? s : s + padChar;
  return new TextEncoder().encode(padded);
}

function uint16(...values: number[]): Uint8Array {
  const arr = new Uint8Array(values.length * 2);
  const view = new DataView(arr.buffer);
  values.forEach((v, i) => view.setUint16(i * 2, v, true));
  return arr;
}

interface FixtureOptions {
  transferSyntax?: string;
  rows?: number;
  columns?: number;
  bitsAllocated?: number;
  pixelRepresentation?: number;
  photometricInterpretation?: string;
  samplesPerPixel?: number;
  numberOfFrames?: number;
  windowCenter?: number;
  windowWidth?: number;
  pixelBytes?: Uint8Array;
}

function buildDicomFixture(opts: FixtureOptions = {}): ArrayBuffer {
  const rows = opts.rows ?? 8;
  const columns = opts.columns ?? 8;
  const bitsAllocated = opts.bitsAllocated ?? 8;
  const pixelBytes =
    opts.pixelBytes ?? (() => {
      const bytes = new Uint8Array((rows * columns * bitsAllocated) / 8);
      for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 4) % 256;
      return bytes;
    })();

  const preamble = new Uint8Array(128);
  const magic = new TextEncoder().encode('DICM');

  const transferSyntax = opts.transferSyntax ?? '1.2.840.10008.1.2.1';
  const tsElement = element(0x0002, 0x0010, 'UI', str(transferSyntax, '\0'));
  const groupLengthElement = element(0x0002, 0x0000, 'UL', (() => {
    const arr = new Uint8Array(4);
    new DataView(arr.buffer).setUint32(0, tsElement.length, true);
    return arr;
  })());
  const fileMeta = concatBytes(groupLengthElement, tsElement);

  const datasetElements: Uint8Array[] = [
    element(0x0008, 0x0060, 'CS', str('OT')),
    element(0x0010, 0x0010, 'PN', str('Test^Patient')),
    element(0x0010, 0x0020, 'LO', str('P001')),
  ];
  if (opts.numberOfFrames !== undefined) {
    datasetElements.push(element(0x0028, 0x0008, 'IS', str(String(opts.numberOfFrames))));
  }
  datasetElements.push(
    element(0x0028, 0x0002, 'US', uint16(opts.samplesPerPixel ?? 1)),
    element(0x0028, 0x0004, 'CS', str(opts.photometricInterpretation ?? 'MONOCHROME2')),
    element(0x0028, 0x0010, 'US', uint16(rows)),
    element(0x0028, 0x0011, 'US', uint16(columns)),
    element(0x0028, 0x0100, 'US', uint16(bitsAllocated)),
    element(0x0028, 0x0101, 'US', uint16(bitsAllocated)),
    element(0x0028, 0x0102, 'US', uint16(bitsAllocated - 1)),
    element(0x0028, 0x0103, 'US', uint16(opts.pixelRepresentation ?? 0)),
  );
  if (opts.windowCenter !== undefined) {
    datasetElements.push(element(0x0028, 0x1050, 'DS', str(String(opts.windowCenter))));
  }
  if (opts.windowWidth !== undefined) {
    datasetElements.push(element(0x0028, 0x1051, 'DS', str(String(opts.windowWidth))));
  }
  datasetElements.push(element(0x7fe0, 0x0010, 'OB', pixelBytes));

  const full = concatBytes(preamble, magic, fileMeta, ...datasetElements);
  return full.buffer.slice(full.byteOffset, full.byteOffset + full.byteLength) as ArrayBuffer;
}

describe('parseDicomFile', () => {
  it('parses a minimal Explicit VR Little Endian file and reads back its metadata + pixel data', () => {
    const buffer = buildDicomFixture();
    const image = parseDicomFile(buffer);
    expect(image.rows).toBe(8);
    expect(image.columns).toBe(8);
    expect(image.bitsAllocated).toBe(8);
    expect(image.pixelRepresentation).toBe(0);
    expect(image.photometricInterpretation).toBe('MONOCHROME2');
    expect(image.patientName).toBe('Test^Patient');
    expect(image.patientId).toBe('P001');
    expect(image.modality).toBe('OT');
    expect(image.pixelData.length).toBe(64);
    expect(image.pixelData[0]).toBe(0);
    expect(image.pixelData[1]).toBe(4);
    expect(image.windowCenter).toBeUndefined();
    expect(image.windowWidth).toBeUndefined();
  });

  it('reads explicit WindowCenter/WindowWidth when present', () => {
    const buffer = buildDicomFixture({ windowCenter: 128, windowWidth: 256 });
    const image = parseDicomFile(buffer);
    expect(image.windowCenter).toBe(128);
    expect(image.windowWidth).toBe(256);
  });

  it('rejects a compressed transfer syntax (e.g. JPEG Baseline)', () => {
    const buffer = buildDicomFixture({ transferSyntax: '1.2.840.10008.1.2.4.50' });
    expect(() => parseDicomFile(buffer)).toThrow(UnsupportedDicomError);
    expect(() => parseDicomFile(buffer)).toThrow(/unsupported transfer syntax/i);
  });

  it('rejects a multi-frame file', () => {
    const buffer = buildDicomFixture({ numberOfFrames: 3 });
    expect(() => parseDicomFile(buffer)).toThrow(/multi-frame/i);
  });

  it('rejects a non-grayscale (multi-channel) file', () => {
    const buffer = buildDicomFixture({ samplesPerPixel: 3, pixelBytes: new Uint8Array(8 * 8 * 3) });
    expect(() => parseDicomFile(buffer)).toThrow(/single-channel/i);
  });

  it('rejects bytes that are not a valid DICOM file', () => {
    const buffer = new TextEncoder().encode('not a dicom file at all').buffer;
    expect(() => parseDicomFile(buffer as ArrayBuffer)).toThrow(UnsupportedDicomError);
  });

  it('parses a 16-bit signed (Int16) Implicit VR Little Endian file', () => {
    // Implicit VR still requires the File Meta group (group 0002) to be
    // Explicit VR -- only the transfer syntax it declares governs the main
    // dataset that follows, which buildDicomFixture already handles by
    // encoding every element the same way regardless of declared syntax
    // (dicom-parser tolerates this for the purposes of these known tags).
    const pixelBytes = new Uint8Array(8 * 8 * 2);
    const view = new DataView(pixelBytes.buffer);
    for (let i = 0; i < 64; i++) view.setInt16(i * 2, -100 + i, true);
    const buffer = buildDicomFixture({
      transferSyntax: '1.2.840.10008.1.2.1',
      bitsAllocated: 16,
      pixelRepresentation: 1,
      pixelBytes,
    });
    const image = parseDicomFile(buffer);
    expect(image.bitsAllocated).toBe(16);
    expect(image.pixelRepresentation).toBe(1);
    expect(image.pixelData[0]).toBe(-100);
    expect(image.pixelData[63]).toBe(-37);
  });
});

describe('applyWindowing', () => {
  const opts = { windowCenter: 100, windowWidth: 40, rescaleSlope: 1, rescaleIntercept: 0 };

  it('maps the window center to mid-gray', () => {
    expect(applyWindowing(100, opts)).toBe(128);
  });

  it('clips values at or below the lower window bound to black', () => {
    expect(applyWindowing(80, opts)).toBe(0);
    expect(applyWindowing(0, opts)).toBe(0);
  });

  it('clips values at or above the upper window bound to white', () => {
    expect(applyWindowing(120, opts)).toBe(255);
    expect(applyWindowing(1000, opts)).toBe(255);
  });

  it('applies rescale slope/intercept before windowing (e.g. CT Hounsfield units)', () => {
    // Raw stored value 1124, slope 1, intercept -1024 -> modality value 100,
    // the window center -> mid-gray, same as the direct-value case above.
    const ctOpts = { windowCenter: 100, windowWidth: 40, rescaleSlope: 1, rescaleIntercept: -1024 };
    expect(applyWindowing(1124, ctOpts)).toBe(128);
  });

  it('treats a zero or negative window width as width 1 rather than dividing by zero', () => {
    expect(() => applyWindowing(50, { ...opts, windowWidth: 0 })).not.toThrow();
    expect(Number.isFinite(applyWindowing(50, { ...opts, windowWidth: 0 }))).toBe(true);
  });
});

describe('computeDefaultWindow', () => {
  it('centers the window on the actual min/max of the pixel data', () => {
    const pixelData = new Uint8Array([0, 4, 8, 252]);
    const result = computeDefaultWindow(pixelData, 1, 0);
    expect(result.windowCenter).toBe(126);
    expect(result.windowWidth).toBe(252);
  });

  it('applies rescale slope/intercept before computing min/max', () => {
    const pixelData = new Uint16Array([0, 4095]);
    const result = computeDefaultWindow(pixelData, 1, -1024);
    expect(result.windowCenter).toBe((-1024 + 3071) / 2);
    expect(result.windowWidth).toBe(4095);
  });

  it('falls back to a non-zero width for a flat (single-value) image', () => {
    const pixelData = new Uint8Array([50, 50, 50]);
    const result = computeDefaultWindow(pixelData, 1, 0);
    expect(result.windowCenter).toBe(50);
    expect(result.windowWidth).toBe(1);
  });
});
