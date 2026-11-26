/**
 * Uploaded files — the shared contract between server and client.
 *
 * A file is uploaded once and never changes; replacing it means uploading a
 * new one. That is what lets its address be cached forever, by browsers and
 * by a CDN in front of the server.
 */
import type { UtcIsoString } from '../time';

export interface StoredFile {
  id: string;
  /**
   * Where to load it from — put this in `<img src>` or a link as is. On the
   * CDN when one is configured (CDN_BASE_URL), otherwise a path on this site.
   * Anyone with the address can load the file.
   */
  url: string;
  /** The name it was uploaded under. */
  name: string;
  /** What the bytes are, as the server detected it — not what the uploader claimed. */
  contentType: string;
  /** Bytes. */
  size: number;
  createdAt: UtcIsoString;
}

/** The form field `POST /api/files` reads the file from. */
export const UPLOAD_FIELD = 'file';

/** What an upload that is not a recognized image is stored and served as: a download. */
export const BINARY_CONTENT_TYPE = 'application/octet-stream';

/** Image types recognized by their leading bytes, with the extension their address ends in. */
const IMAGE_EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/avif': 'avif',
};

/** Whether a browser may show the file in place (an image) rather than download it. */
export function isInlineImage(contentType: string): boolean {
  return contentType in IMAGE_EXTENSIONS;
}

/**
 * The extension a file's address ends in. It is there for CDNs, several of
 * which cache by extension by default; the server ignores it when reading.
 */
export function fileExtension(contentType: string): string {
  return IMAGE_EXTENSIONS[contentType] ?? 'bin';
}

const ascii = (bytes: Uint8Array, start: number, end: number) =>
  String.fromCharCode(...bytes.subarray(start, end));

/**
 * What the bytes are, read from the bytes themselves. The uploader's claimed
 * type and file name are never trusted: a page served as `image/png` because
 * its uploader said so would run as a page. Anything that is not one of the
 * known image formats is `BINARY_CONTENT_TYPE` — SVG included, since an SVG
 * can carry script.
 */
export function detectContentType(bytes: Uint8Array): string {
  const starts = (...signature: number[]) => signature.every((byte, i) => bytes[i] === byte);
  if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'image/png';
  if (starts(0xff, 0xd8, 0xff)) return 'image/jpeg';
  const head = ascii(bytes, 0, 6);
  if (head === 'GIF87a' || head === 'GIF89a') return 'image/gif';
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WEBP') return 'image/webp';
  if (ascii(bytes, 4, 8) === 'ftyp' && ['avif', 'avis'].includes(ascii(bytes, 8, 12))) {
    return 'image/avif';
  }
  return BINARY_CONTENT_TYPE;
}
