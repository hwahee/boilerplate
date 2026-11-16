/**
 * Uploaded files.
 *
 *   POST   /api/files      — upload (multipart/form-data, field `file`)
 *   DELETE /api/files/:id  — delete one's own upload
 *   GET    /files/:name    — the bytes; what `StoredFile.url` points at
 *
 * An upload outlives the visit that made it, so uploading and deleting are
 * for members only (`requireMember`); loading a file leaves nothing behind
 * and is open to anyone who has its address.
 *
 * `/files` is the origin a CDN pulls from (CDN_BASE_URL). It lives outside
 * /api because it serves documents, not the application API: a file's bytes
 * never change, so every answer may be cached forever.
 */
import { isInlineImage, UPLOAD_FIELD } from '@shared/domain/file';
import { ValidationError } from '@shared/validation';

import { requireMember } from '../auth/session';
import type { Container } from '../container';
import { apiRoute, json, type HttpDeps } from '../http/respond';
import { PayloadTooLargeError } from '../lib/errors';

/** Room for the multipart framing around the file when judging by Content-Length. */
const MULTIPART_OVERHEAD_BYTES = 64 * 1024;

const notAFile = () =>
  new ValidationError([
    {
      path: UPLOAD_FIELD,
      message: `Expected multipart/form-data with a file in the "${UPLOAD_FIELD}" field`,
      code: 'invalid_type',
    },
  ]);

export function fileCollectionRoutes(container: Container, deps: HttpDeps) {
  return apiRoute<'/api/files'>(
    {
      /** POST /api/files (multipart, field `file`) → 201 StoredFile | 400 | 401 for a guest | 413 */
      POST: async (req, ctx) => {
        requireMember(ctx.caller);
        const files = container.fileService();

        // Turn an oversized upload away before reading it into memory.
        const declared = Number(req.headers.get('content-length') ?? 0);
        if (declared > files.maxBytes + MULTIPART_OVERHEAD_BYTES) {
          throw new PayloadTooLargeError(files.maxBytes);
        }

        const form = await req.formData().catch(() => null);
        const file = form?.get(UPLOAD_FIELD);
        if (!(file instanceof File)) throw notAFile();
        if (file.size > files.maxBytes) throw new PayloadTooLargeError(files.maxBytes);

        const stored = await files.upload({
          name: file.name,
          bytes: new Uint8Array(await file.arrayBuffer()),
          ownerId: ctx.caller.kind === 'member' ? ctx.caller.userId : null,
        });
        return json(stored, { status: 201 });
      },
    },
    deps,
  );
}

export function fileItemRoutes(container: Container, deps: HttpDeps) {
  return apiRoute<'/api/files/:id'>(
    {
      /** DELETE /api/files/:id → 204 | 404 | 401 for a guest | 403 for another member's file */
      DELETE: async (req, ctx) => {
        requireMember(ctx.caller);
        await container.fileService().delete(req.params.id, ctx.caller);
        return new Response(null, { status: 204 });
      },
    },
    deps,
  );
}

/** A year — as long as `max-age` is honored; `immutable` skips revalidation too. */
const CACHE_FOREVER = 'public, max-age=31536000, immutable';

export function fileContentRoute(container: Container, deps: HttpDeps) {
  return apiRoute<'/files/:name'>(
    {
      /** GET /files/{id}.{ext} → the bytes | 304 | 404. The extension is for CDNs and ignored here. */
      GET: async (req) => {
        const id = req.params.name.split('.')[0] ?? '';
        const { file, body } = await container.fileService().open(id);

        const etag = `"${file.sha256}"`;
        const headers: Record<string, string> = {
          'cache-control': CACHE_FOREVER,
          etag,
        };
        if (req.headers.get('if-none-match') === etag) {
          return new Response(null, { status: 304, headers });
        }

        const inline = isInlineImage(file.contentType);
        return new Response(body, {
          headers: {
            ...headers,
            'content-type': file.contentType,
            'content-length': String(file.size),
            // Only recognized images open in the browser; everything else
            // downloads under the name it was uploaded with.
            'content-disposition': inline
              ? 'inline'
              : `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`,
            // Uploads are other people's bytes on this site's origin: never
            // let a browser guess a type or run anything inside one.
            'x-content-type-options': 'nosniff',
            'content-security-policy': "default-src 'none'; sandbox",
          },
        });
      },
    },
    deps,
  );
}
