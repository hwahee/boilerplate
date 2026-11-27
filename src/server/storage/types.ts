/**
 * Bulk storage contract — where uploaded bytes live.
 *
 * The file service (src/server/services/file-service.ts) depends on this
 * interface only; the driver is chosen by configuration (STORAGE_DRIVER):
 *
 *   - `local`  — a directory on the machine the server runs on (a home
 *                computer, a mounted volume).
 *   - `s3`     — an S3 bucket, or anything that speaks S3 (MinIO on a home
 *                computer, Cloudflare R2, …), via Bun's built-in client.
 *   - `gdrive` — a folder in Google Drive.
 *   - `sftp`   — a directory on another machine, over SSH.
 *   - `memory` — the process's memory; for tests.
 *
 * A store holds bytes and nothing else: the name, type, size and owner of a
 * file are rows in the `files` table. Stored bytes never change — a new
 * upload is a new key — which is what lets a CDN keep them forever.
 */
export type BlobBody = Blob | ReadableStream<Uint8Array>;

export interface BlobStore {
  /**
   * Stores `bytes` and returns the reference to find them by later. Stores
   * that address by name return `key`; Google Drive returns its own file id.
   */
  put(key: string, bytes: Uint8Array<ArrayBuffer>, contentType: string): Promise<string>;
  /** The stored bytes, or `null` when the store has nothing under `ref`. */
  get(ref: string): Promise<BlobBody | null>;
  /** Deleting what is already gone is not an error. */
  delete(ref: string): Promise<void>;
}
