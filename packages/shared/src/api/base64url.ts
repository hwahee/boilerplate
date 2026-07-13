/**
 * Base64url for UTF-8 strings, implemented in pure TypeScript.
 *
 * Why hand-rolled: cursors must encode/decode on BOTH runtimes — Bun (server)
 * and Hermes (app) — and neither `Buffer` nor `btoa`/`atob` is reliably
 * available on Hermes without polyfills. ~50 lines of dependency-free code
 * keep the shared package platform-pure.
 */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

const REVERSE: Record<string, number> = {};
for (let i = 0; i < ALPHABET.length; i++) REVERSE[ALPHABET[i]!] = i;

/** UTF-8 encodes `text`, then base64url-encodes the bytes (no padding). */
export function encodeBase64Url(text: string): string {
  const bytes = utf8Encode(text);
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i]!;
    const b1 = bytes[i + 1];
    const b2 = bytes[i + 2];
    out += ALPHABET[b0 >> 2]!;
    out += ALPHABET[((b0 & 0x03) << 4) | ((b1 ?? 0) >> 4)]!;
    if (b1 === undefined) break;
    out += ALPHABET[((b1 & 0x0f) << 2) | ((b2 ?? 0) >> 6)]!;
    if (b2 === undefined) break;
    out += ALPHABET[b2 & 0x3f]!;
  }
  return out;
}

/** Reverses {@link encodeBase64Url}; returns `null` on malformed input (never throws). */
export function decodeBase64Url(encoded: string): string | null {
  if (encoded.length % 4 === 1) return null;
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const char of encoded) {
    const value = REVERSE[char];
    if (value === undefined) return null;
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  return utf8Decode(bytes);
}

function utf8Encode(text: string): number[] {
  const bytes: number[] = [];
  for (const char of text) {
    const code = char.codePointAt(0)!;
    if (code < 0x80) {
      bytes.push(code);
    } else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code < 0x10000) {
      bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    } else {
      bytes.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
    }
  }
  return bytes;
}

function utf8Decode(bytes: number[]): string | null {
  let out = '';
  let i = 0;
  while (i < bytes.length) {
    const b0 = bytes[i]!;
    let code: number;
    let extra: number;
    if (b0 < 0x80) {
      code = b0;
      extra = 0;
    } else if ((b0 & 0xe0) === 0xc0) {
      code = b0 & 0x1f;
      extra = 1;
    } else if ((b0 & 0xf0) === 0xe0) {
      code = b0 & 0x0f;
      extra = 2;
    } else if ((b0 & 0xf8) === 0xf0) {
      code = b0 & 0x07;
      extra = 3;
    } else {
      return null;
    }
    if (i + extra >= bytes.length) return null;
    for (let j = 1; j <= extra; j++) {
      const bn = bytes[i + j]!;
      if ((bn & 0xc0) !== 0x80) return null;
      code = (code << 6) | (bn & 0x3f);
    }
    if (code > 0x10ffff) return null;
    out += String.fromCodePoint(code);
    i += extra + 1;
  }
  return out;
}
