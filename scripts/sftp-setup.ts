/**
 * One-step SFTP storage (`bun run sftp:setup`): runs the SFTP-only container
 * (docker/sftp) and points this service at it.
 *
 *   1. Makes the keys in ./.sftp (once; kept afterwards, gitignored):
 *      the server's host key and the key this service signs in with.
 *   2. Builds and starts the `sftp` compose service on SFTP_PORT (2222).
 *   3. Waits for it, then uploads, reads back and deletes a test file through
 *      the same driver the server uses.
 *   4. Prints the lines to paste into .env (and saves them to
 *      .sftp/sftp.env). It never edits .env itself.
 *
 * Running it again reuses the keys (so the fingerprint and the printed lines
 * stay the same) and keeps the uploaded files (the `sftp-data` volume).
 */
import { chmod, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { $ } from 'bun';
import { utils } from 'ssh2';

import { createSftpBlobStore, sshFingerprint } from '../src/server/storage/sftp';

const KEY_DIR = resolve('.sftp');
const HOST_KEY = join(KEY_DIR, 'host_ed25519_key');
const CLIENT_KEY = join(KEY_DIR, 'client_ed25519');
const ENV_SNIPPET = join(KEY_DIR, 'sftp.env');
const port = Number(process.env.SFTP_PORT ?? 2222);

/** Writes a key pair unless it is already there; returns the public key line. */
async function ensureKeyPair(privatePath: string, comment: string): Promise<string> {
  const publicPath = `${privatePath}.pub`;
  if (!(await Bun.file(privatePath).exists())) {
    const pair = utils.generateKeyPairSync('ed25519', { comment });
    await Bun.write(privatePath, pair.private);
    await Bun.write(publicPath, `${pair.public}\n`);
    console.log(`Made ${privatePath}`);
  }
  // Private keys readable by the owner only (ssh refuses anything looser).
  // Every run, so keys made by an older version get fixed too. No effect on
  // Windows, where files are private to their user anyway.
  await chmod(privatePath, 0o600);
  return Bun.file(publicPath).text();
}

function fingerprintOf(publicKeyLine: string): string {
  const parsed = utils.parseKey(publicKeyLine);
  if (parsed instanceof Error) throw parsed;
  return sshFingerprint(parsed.getPublicSSH());
}

await mkdir(KEY_DIR, { recursive: true });
const hostPublic = await ensureKeyPair(HOST_KEY, 'sftp-host');
await ensureKeyPair(CLIENT_KEY, 'sftp-client');
// The container reads the client's public key under this name.
await Bun.write(join(KEY_DIR, 'client_ed25519.pub'), await Bun.file(`${CLIENT_KEY}.pub`).text());

console.log('Starting the sftp container…');
const up = await $`docker compose --profile sftp up -d --build --wait sftp`
  .env({ ...process.env, SFTP_PORT: String(port) })
  .nothrow();
if (up.exitCode !== 0) {
  console.error('docker compose failed — is Docker running?');
  process.exit(1);
}

const config = {
  host: '127.0.0.1',
  port,
  username: 'uploader',
  privateKeyPath: CLIENT_KEY,
  hostFingerprint: fingerprintOf(hostPublic),
  directory: '/data/uploads',
};

// sshd can accept connections a moment before it accepts sign-ins.
const store = createSftpBlobStore(config);
const probe = `setup-check-${Date.now()}`;
let lastError: unknown;
for (let attempt = 0; attempt < 20; attempt++) {
  try {
    const ref = await store.put(probe, new TextEncoder().encode('ok'), 'text/plain');
    const body = await store.get(ref);
    if ((await new Response(body).text()) !== 'ok') throw new Error('read back something else');
    await store.delete(ref);
    lastError = undefined;
    break;
  } catch (error) {
    lastError = error;
    await Bun.sleep(500);
  }
}
if (lastError !== undefined) {
  console.error('The container is up but uploading through it failed:', lastError);
  process.exit(1);
}
console.log('Checked: upload, read back and delete through SFTP work.');

const values: Record<string, string> = {
  STORAGE_DRIVER: 'sftp',
  SFTP_HOST: 'localhost',
  SFTP_PORT: String(port),
  SFTP_USERNAME: config.username,
  SFTP_PRIVATE_KEY_PATH: CLIENT_KEY,
  SFTP_HOST_FINGERPRINT: config.hostFingerprint,
  SFTP_DIRECTORY: config.directory,
};
const snippet = Object.entries(values)
  .map(([name, value]) => `${name}=${value}`)
  .join('\n');
await Bun.write(ENV_SNIPPET, `${snippet}\n`);

console.log(`
Paste these lines into .env (replacing any STORAGE_DRIVER / SFTP_* lines already
there), then restart the server. They are also saved in ${ENV_SNIPPET}.

----- 8< ----- .env -----
${snippet}
----- >8 -----------------`);

process.exit(0); // the SFTP connection would otherwise keep the process alive
