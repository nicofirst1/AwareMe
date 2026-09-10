/**
 * Minimal ZIP writer: STORE method only (no compression), local file headers
 * + a central directory. This is the entire ZIP spec surface the CSV export
 * needs (§8's "CSV set... zipped"), written with no dependency — every JS
 * engine this app runs under (Hermes on-device, Node in tests) has
 * `TextEncoder` and nothing else this needs. Reuses a hand-rolled CRC32
 * table rather than `node:zlib.crc32`, which doesn't exist on-device.
 *
 * Deliberately write-only: nothing in this app reads a zip back in (import
 * restores from the JSON bundle, spec §8), so no unzip was written.
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** MS-DOS date/time (zip's timestamp format), from a UTC `Date`. Only used for the archive's own metadata, never user data. */
function dosDateTime(date: Date): { time: number; date: number } {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);
  const dosDate = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, date: dosDate };
}

export interface ZipEntry {
  name: string;
  content: string;
}

function writeUint32LE(view: DataView, offset: number, value: number): void {
  view.setUint32(offset, value, true);
}
function writeUint16LE(view: DataView, offset: number, value: number): void {
  view.setUint16(offset, value, true);
}

/** Builds a ZIP archive (STORE method) containing the given text entries. */
export function buildZip(entries: readonly ZipEntry[], now: Date = new Date()): Uint8Array {
  const encoder = new TextEncoder();
  const { time, date } = dosDateTime(now);

  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const dataBytes = encoder.encode(entry.content);
    const crc = crc32(dataBytes);

    const local = new Uint8Array(30 + nameBytes.length);
    const localView = new DataView(local.buffer);
    writeUint32LE(localView, 0, 0x04034b50);
    writeUint16LE(localView, 4, 20); // version needed
    writeUint16LE(localView, 6, 0); // flags
    writeUint16LE(localView, 8, 0); // method: STORE
    writeUint16LE(localView, 10, time);
    writeUint16LE(localView, 12, date);
    writeUint32LE(localView, 14, crc);
    writeUint32LE(localView, 18, dataBytes.length); // compressed size
    writeUint32LE(localView, 22, dataBytes.length); // uncompressed size
    writeUint16LE(localView, 26, nameBytes.length);
    writeUint16LE(localView, 28, 0); // extra field length
    local.set(nameBytes, 30);
    localParts.push(local, dataBytes);

    const central = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(central.buffer);
    writeUint32LE(centralView, 0, 0x02014b50);
    writeUint16LE(centralView, 4, 20); // version made by
    writeUint16LE(centralView, 6, 20); // version needed
    writeUint16LE(centralView, 8, 0); // flags
    writeUint16LE(centralView, 10, 0); // method: STORE
    writeUint16LE(centralView, 12, time);
    writeUint16LE(centralView, 14, date);
    writeUint32LE(centralView, 16, crc);
    writeUint32LE(centralView, 20, dataBytes.length);
    writeUint32LE(centralView, 24, dataBytes.length);
    writeUint16LE(centralView, 28, nameBytes.length);
    writeUint16LE(centralView, 30, 0); // extra length
    writeUint16LE(centralView, 32, 0); // comment length
    writeUint16LE(centralView, 34, 0); // disk number start
    writeUint16LE(centralView, 36, 0); // internal attrs
    writeUint32LE(centralView, 38, 0); // external attrs
    writeUint32LE(centralView, 42, offset); // local header offset
    central.set(nameBytes, 46);
    centralParts.push(central);

    offset += local.length + dataBytes.length;
  }

  const centralSize = centralParts.reduce((n, p) => n + p.length, 0);
  const centralOffset = offset;

  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  writeUint32LE(endView, 0, 0x06054b50);
  writeUint16LE(endView, 4, 0); // disk number
  writeUint16LE(endView, 6, 0); // disk with central dir
  writeUint16LE(endView, 8, entries.length);
  writeUint16LE(endView, 10, entries.length);
  writeUint32LE(endView, 12, centralSize);
  writeUint32LE(endView, 16, centralOffset);
  writeUint16LE(endView, 20, 0); // comment length

  const totalSize = offset + centralSize + end.length;
  const out = new Uint8Array(totalSize);
  let pos = 0;
  for (const part of [...localParts, ...centralParts, end]) {
    out.set(part, pos);
    pos += part.length;
  }
  return out;
}
