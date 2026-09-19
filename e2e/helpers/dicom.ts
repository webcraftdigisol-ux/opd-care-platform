// Hand-builds a minimal, real DICOM Part 10 file (128-byte preamble + "DICM"
// + a File Meta group + a main dataset, both Explicit VR Little Endian) as a
// Buffer Playwright can hand straight to setInputFiles -- no on-disk fixture
// or real modality device needed. Deliberately duplicated (not imported)
// from web/src/utils/dicom.test.ts's own fixture builder, matching this
// repo's existing convention of small, self-contained per-package test
// fixture helpers rather than a new cross-package dependency.
const SHORT_FORM_VRS = new Set([
  'AE', 'AS', 'AT', 'CS', 'DA', 'DS', 'DT', 'FL', 'FD', 'IS', 'LO', 'LT', 'PN', 'SH', 'SL', 'SS', 'ST', 'TM', 'UI', 'UL', 'US',
]);

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
    view.setUint32(8, value.length, true);
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

// An 8x8, 8-bit grayscale image, distinct pixel per index (value = index*4)
// so a test can assert on specific rendered pixels, not just "a canvas
// exists". Rows/Columns/BitsAllocated are fixed to keep the fixture simple;
// callers needing different dimensions should extend this, not the caller.
export function buildDicomFixture(): Buffer {
  const rows = 8;
  const columns = 8;
  const pixelBytes = new Uint8Array(rows * columns);
  for (let i = 0; i < pixelBytes.length; i++) pixelBytes[i] = (i * 4) % 256;

  const preamble = new Uint8Array(128);
  const magic = new TextEncoder().encode('DICM');

  const tsElement = element(0x0002, 0x0010, 'UI', str('1.2.840.10008.1.2.1', '\0'));
  const groupLengthValue = new Uint8Array(4);
  new DataView(groupLengthValue.buffer).setUint32(0, tsElement.length, true);
  const groupLengthElement = element(0x0002, 0x0000, 'UL', groupLengthValue);
  const fileMeta = concatBytes(groupLengthElement, tsElement);

  const dataset = concatBytes(
    element(0x0008, 0x0060, 'CS', str('OT')),
    element(0x0010, 0x0010, 'PN', str('E2E^Patient')),
    element(0x0010, 0x0020, 'LO', str('E2E001')),
    element(0x0028, 0x0002, 'US', uint16(1)),
    element(0x0028, 0x0004, 'CS', str('MONOCHROME2')),
    element(0x0028, 0x0010, 'US', uint16(rows)),
    element(0x0028, 0x0011, 'US', uint16(columns)),
    element(0x0028, 0x0100, 'US', uint16(8)),
    element(0x0028, 0x0101, 'US', uint16(8)),
    element(0x0028, 0x0102, 'US', uint16(7)),
    element(0x0028, 0x0103, 'US', uint16(0)),
    element(0x7fe0, 0x0010, 'OB', pixelBytes),
  );

  const full = concatBytes(preamble, magic, fileMeta, dataset);
  return Buffer.from(full);
}
