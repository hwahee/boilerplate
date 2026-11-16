import type { ServerConfig } from '../config';
import { createGoogleDriveBlobStore } from './gdrive';
import { createLocalBlobStore } from './local';
import { createMemoryBlobStore } from './memory';
import { createS3BlobStore } from './s3';
import type { BlobStore } from './types';

export type { BlobStore } from './types';

/** Driver selection is pure configuration — see STORAGE_DRIVER in .env.example. */
export function createBlobStore(config: ServerConfig): BlobStore {
  switch (config.storageDriver) {
    case 'local':
      if (!config.storageLocalDir) throw new Error('STORAGE_LOCAL_DIR is not configured');
      return createLocalBlobStore(config.storageLocalDir);
    case 's3':
      if (!config.s3) throw new Error('STORAGE_DRIVER=s3 is not configured');
      return createS3BlobStore(config.s3);
    case 'gdrive':
      if (!config.gdrive) throw new Error('STORAGE_DRIVER=gdrive is not configured');
      return createGoogleDriveBlobStore(config.gdrive);
    case 'memory':
      return createMemoryBlobStore();
  }
}
