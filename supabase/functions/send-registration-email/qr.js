/* ═══════════════════════════════════════════════════════════════
   VOIDHACK 2026 — QR PNG builder (Supabase Edge Function)
   Pure-Deno QR encoder + minimal PNG writer. Runs ONLY server-side.

   • qrcode-generator (pure JS, no canvas) produces the module matrix.
   • A small PNG encoder writes a true grayscale PNG:
       signature + IHDR + IDAT + IEND
     with zlib-compressed scanlines (CompressionStream('deflate') emits
     RFC-1950 zlib — exactly what a PNG IDAT needs) and CRC32 checksums.
   • Output is a REAL scannable QR (quiet zone included) — verified by
     the html5-qrcode reader on the admin scanner page.
   ═══════════════════════════════════════════════════════════════ */

import qrcode from 'npm:qrcode-generator@1.4.4';

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c;
  }
  return table;
})();

function crc32(bytes) {
  let c = -1;
  for (let i = 0; i < bytes.length; i += 1) {
    c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ -1) >>> 0;
}

const TEXT = new TextEncoder();

function chunkBytes(parts) {
  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

function chunk(type, data) {
  const typeBytes = TEXT.encode(type);
  const lenBytes = new Uint8Array(4);
  new DataView(lenBytes.buffer).setUint32(0, data.length, false);

  const crcInput = chunkBytes([typeBytes, data]);
  const crcBytes = new Uint8Array(4);
  new DataView(crcBytes.buffer).setUint32(0, crc32(crcInput), false);

  return chunkBytes([lenBytes, typeBytes, data, crcBytes]);
}

/* zlib-compress raw scanlines via the Web Streams API (RFC 1950). */
async function zlibCompress(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate'));
  const buf = await new Response(stream).arrayBuffer();
  return new Uint8Array(buf);
}

function u32(value) {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, value, false);
  return b;
}

/**
 * Build a real, scannable QR as a PNG (grayscale, quiet zone included).
 * @param {string} text  payload (the opaque /attendance/scan?t=<token> URL)
 * @param {number} padding Per-module optical padding around the matrix
 * @returns {Promise<Uint8Array>} PNG bytes
 */
export async function buildQrPng(text, padding = 4) {
  const qr = qrcode(0, 'M');
  qr.addData(String(text));
  qr.make();

  const modules = qr.getModuleCount();
  const scale = 4; // crisp on hi-dpi phones, still small in email HTML
  const dim = (modules + padding * 2) * scale;

  /* grayscale: dark = 0, light = 255. One filter byte (0 = None) per row. */
  const raw = new Uint8Array(dim * (dim + 1));
  for (let y = 0; y < dim; y += 1) {
    const rowStart = y * (dim + 1) + 1;
    const moduleY = Math.floor(y / scale) - padding;
    for (let x = 0; x < dim; x += 1) {
      const moduleX = Math.floor(x / scale) - padding;
      const dark =
        moduleY >= 0 &&
        moduleY < modules &&
        moduleX >= 0 &&
        moduleX < modules &&
        qr.isDark(moduleY, moduleX);
      raw[rowStart + x] = dark ? 0 : 255;
    }
  }

  const idat = await zlibCompress(raw);

  const signature = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdrData = chunkBytes([
    u32(dim),
    u32(dim),
    new Uint8Array([8, 0, 0, 0, 0]), // bit depth 8, grayscale, deflate, no filter, no interlace
  ]);

  return chunkBytes([
    signature,
    chunk('IHDR', ihdrData),
    chunk('IDAT', idat),
    chunk('IEND', new Uint8Array(0)),
  ]);
}