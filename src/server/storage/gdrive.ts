import type { ServerConfig } from '../config';
import type { BlobStore } from './types';

type GoogleDriveConfig = NonNullable<ServerConfig['gdrive']>;

/** Google's endpoints; tests point these at a stand-in. */
export interface GoogleDriveEndpoints {
  token: string;
  /** Metadata, download and delete: `{api}/files/{id}`. */
  api: string;
  /** Upload: `{upload}/files`. */
  upload: string;
}

const GOOGLE: GoogleDriveEndpoints = {
  token: 'https://oauth2.googleapis.com/token',
  api: 'https://www.googleapis.com/drive/v3',
  upload: 'https://www.googleapis.com/upload/drive/v3',
};

/** A new access token is fetched this long before the current one runs out. */
const TOKEN_MARGIN_MS = 60_000;

/**
 * A folder in Google Drive, over the Drive v3 REST API (no external package).
 *
 * The server acts as the Google account that owns the folder: it holds that
 * account's OAuth refresh token (`bun run scripts/gdrive-setup.ts` obtains
 * one) and trades it for short-lived access tokens. This is server-to-Google
 * only — no member ever sees these tokens, and member sign-in is unrelated.
 *
 * Drive addresses files by its own id, so `put` returns that id as the
 * reference. Drive is slow and rate-limited as an origin; put a CDN in front
 * (CDN_BASE_URL) so each file is read from Drive only now and then.
 */
export function createGoogleDriveBlobStore(
  config: GoogleDriveConfig,
  endpoints: GoogleDriveEndpoints = GOOGLE,
): BlobStore {
  let token: { value: string; expiresAt: number } | null = null;
  let refreshing: Promise<string> | null = null;

  async function fetchAccessToken(): Promise<string> {
    const response = await fetch(endpoints.token, {
      method: 'POST',
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: config.clientId,
        client_secret: config.clientSecret,
        refresh_token: config.refreshToken,
      }),
    });
    if (!response.ok) throw await driveError('token', response);
    const body = (await response.json()) as { access_token: string; expires_in: number };
    token = { value: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 };
    return token.value;
  }

  /** The current access token; concurrent callers share one refresh. */
  async function accessToken(): Promise<string> {
    if (token && Date.now() < token.expiresAt - TOKEN_MARGIN_MS) return token.value;
    refreshing ??= fetchAccessToken().finally(() => (refreshing = null));
    return refreshing;
  }

  /** Calls Drive as the folder's owner; a rejected token is renewed once. */
  async function call(url: string, init: RequestInit = {}): Promise<Response> {
    const send = async () =>
      fetch(url, {
        ...init,
        headers: { ...init.headers, authorization: `Bearer ${await accessToken()}` },
      });
    const response = await send();
    if (response.status !== 401) return response;
    token = null;
    return send();
  }

  return {
    async put(key, bytes, contentType) {
      // Resumable upload: one request names the file, the next sends the
      // bytes. Unlike the single-request forms it has no size ceiling.
      const session = await call(
        `${endpoints.upload}/files?uploadType=resumable&supportsAllDrives=true&fields=id`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json; charset=UTF-8',
            'x-upload-content-type': contentType,
            'x-upload-content-length': String(bytes.byteLength),
          },
          body: JSON.stringify({ name: key, parents: [config.folderId] }),
        },
      );
      const uploadUrl = session.headers.get('location');
      if (!session.ok || !uploadUrl) throw await driveError('upload start', session);

      const uploaded = await call(uploadUrl, {
        method: 'PUT',
        headers: { 'content-type': contentType },
        body: bytes,
      });
      if (!uploaded.ok) throw await driveError('upload', uploaded);
      const { id } = (await uploaded.json()) as { id: string };
      return id;
    },

    async get(ref) {
      const response = await call(
        `${endpoints.api}/files/${encodeURIComponent(ref)}?alt=media&supportsAllDrives=true`,
      );
      if (response.status === 404) return null;
      if (!response.ok || !response.body) throw await driveError('download', response);
      return response.body;
    },

    async delete(ref) {
      const response = await call(
        `${endpoints.api}/files/${encodeURIComponent(ref)}?supportsAllDrives=true`,
        { method: 'DELETE' },
      );
      if (!response.ok && response.status !== 404) throw await driveError('delete', response);
    },
  };
}

async function driveError(step: string, response: Response): Promise<Error> {
  const detail = (await response.text().catch(() => '')).slice(0, 300);
  return new Error(`Google Drive ${step} failed: HTTP ${response.status} ${detail}`);
}
