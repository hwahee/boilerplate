/**
 * Uploaded files: bytes into the blob store, a row into `files`, and back
 * out as an address a browser or CDN can cache forever.
 *
 * The two stores cannot share a transaction, so the order is chosen for what
 * a failure leaves behind: bytes first on upload and the row first on delete —
 * either way the leftover is bytes nobody points at, never a row whose bytes
 * are missing.
 */
import { detectContentType, fileExtension, type StoredFile } from '@shared/domain/file';
import { nowUtc } from '@shared/time';
import { ValidationError } from '@shared/validation';

import type { Caller } from '../auth/session';
import type { ServerConfig } from '../config';
import { ForbiddenError, NotFoundError, PayloadTooLargeError } from '../lib/errors';
import type { Logger } from '../lib/log';
import type { FileRecord, FileRepository } from '../repositories/types';
import type { BlobStore } from '../storage';
import type { BlobBody } from '../storage/types';

interface FileServiceDeps {
  files: FileRepository;
  blobs: BlobStore;
  config: Pick<ServerConfig, 'uploadMaxBytes' | 'cdnBaseUrl'>;
  log: Logger;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MAX_NAME_LENGTH = 255;

/** The last path segment, without control characters — a label, never a path. */
function cleanName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? '';
  // eslint-disable-next-line no-control-regex -- stripping them is the point
  const cleaned = base.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return cleaned.slice(0, MAX_NAME_LENGTH) || 'file';
}

export class FileService {
  constructor(private readonly deps: FileServiceDeps) {}

  get maxBytes(): number {
    return this.deps.config.uploadMaxBytes;
  }

  /** Stores an upload. `ownerId` is the member uploading, or null without sign-in. */
  async upload(input: {
    name: string;
    bytes: Uint8Array<ArrayBuffer>;
    ownerId: string | null;
  }): Promise<StoredFile> {
    const { bytes } = input;
    if (bytes.byteLength === 0) {
      throw new ValidationError([{ path: 'file', message: 'File is empty', code: 'too_small' }]);
    }
    if (bytes.byteLength > this.maxBytes) throw new PayloadTooLargeError(this.maxBytes);

    const id = crypto.randomUUID();
    const contentType = detectContentType(bytes);
    const storageRef = await this.deps.blobs.put(id, bytes, contentType);
    const record: FileRecord = {
      id,
      ownerId: input.ownerId,
      name: cleanName(input.name),
      contentType,
      size: bytes.byteLength,
      sha256: new Bun.CryptoHasher('sha256').update(bytes).digest('hex'),
      storageRef,
      createdAt: nowUtc(),
    };
    try {
      await this.deps.files.insert(record);
    } catch (error) {
      await this.discard(storageRef);
      throw error;
    }
    return this.describe(record);
  }

  /** The file and its bytes, for serving. Throws NotFoundError. */
  async open(id: string): Promise<{ file: FileRecord; body: BlobBody }> {
    const file = await this.find(id);
    const body = await this.deps.blobs.get(file.storageRef);
    if (!body) {
      // The row outlived its bytes: the store was emptied or switched.
      this.deps.log.error('file bytes missing from the blob store', { id });
      throw new NotFoundError('file', id);
    }
    return { file, body };
  }

  /**
   * Deletes a file. Only its uploader may; a file uploaded without sign-in has
   * no uploader and anyone allowed to upload may delete it. A CDN keeps
   * serving its copy until that expires or is purged there.
   */
  async delete(id: string, caller: Caller): Promise<void> {
    const file = await this.find(id);
    if (caller.kind === 'member' && file.ownerId !== null && file.ownerId !== caller.userId) {
      throw new ForbiddenError();
    }
    if (!(await this.deps.files.deleteById(id))) throw new NotFoundError('file', id);
    await this.discard(file.storageRef);
  }

  private async find(id: string): Promise<FileRecord> {
    const file = UUID.test(id) ? await this.deps.files.findById(id) : null;
    if (!file) throw new NotFoundError('file', id);
    return file;
  }

  /** Best effort: bytes left behind are wasted space, not a failed request. */
  private async discard(storageRef: string): Promise<void> {
    try {
      await this.deps.blobs.delete(storageRef);
    } catch (error) {
      this.deps.log.warn('could not delete bytes from the blob store', {
        storageRef,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private describe(file: FileRecord): StoredFile {
    const base = this.deps.config.cdnBaseUrl?.replace(/\/+$/, '') ?? '';
    return {
      id: file.id,
      url: `${base}/files/${file.id}.${fileExtension(file.contentType)}`,
      name: file.name,
      contentType: file.contentType,
      size: file.size,
      createdAt: file.createdAt,
    };
  }
}
