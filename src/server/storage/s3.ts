import { S3Client } from 'bun';

import type { ServerConfig } from '../config';
import type { BlobStore } from './types';

type S3Config = NonNullable<ServerConfig['s3']>;

/**
 * An S3 bucket through Bun's built-in client (no external package). With
 * `S3_ENDPOINT` set it is any S3-compatible store instead of AWS — MinIO on a
 * home computer, Cloudflare R2, Backblaze B2.
 *
 * The bucket stays private: browsers load files from this server's `/files`
 * (or the CDN in front of it), never from the bucket.
 */
export function createS3BlobStore(config: S3Config): BlobStore {
  const client = new S3Client({
    bucket: config.bucket,
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    ...(config.region ? { region: config.region } : {}),
    ...(config.endpoint ? { endpoint: config.endpoint } : {}),
  });

  return {
    async put(key, bytes, contentType) {
      await client.write(key, bytes, { type: contentType });
      return key;
    },

    async get(ref) {
      const file = client.file(ref);
      return (await file.exists()) ? file.stream() : null;
    },

    async delete(ref) {
      await client.delete(ref); // S3 answers 204 for a key that is already gone
    },
  };
}
