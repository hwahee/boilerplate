import type { BlobStore } from './types';

/** Keeps uploads in the process's memory — tests only; a restart loses them. */
export function createMemoryBlobStore(): BlobStore {
  const blobs = new Map<string, Blob>();
  return {
    put(key, bytes, contentType) {
      blobs.set(key, new Blob([bytes], { type: contentType }));
      return Promise.resolve(key);
    },
    get: (ref) => Promise.resolve(blobs.get(ref) ?? null),
    delete(ref) {
      blobs.delete(ref);
      return Promise.resolve();
    },
  };
}
