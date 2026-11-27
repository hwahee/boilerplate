/**
 * An SSH server with an SFTP subsystem, for tests: it serves one directory on
 * this machine and lets in one user with one key. Built on ssh2's server, so
 * the SFTP driver is tested against the real protocol.
 */
import {
  closeSync,
  fstatSync,
  mkdirSync,
  openSync,
  readSync,
  renameSync,
  statSync,
  unlinkSync,
  writeSync,
  type Stats,
} from 'node:fs';
import { join, normalize } from 'node:path';

import { Server, utils, type Attributes, type ParsedKey } from 'ssh2';

import { sshFingerprint } from './sftp';

const { OPEN_MODE, STATUS_CODE } = utils.sftp;

interface TestSftpServer {
  port: number;
  /** The host key's fingerprint, as SFTP_HOST_FINGERPRINT takes it. */
  hostFingerprint: string;
  /** A private key (OpenSSH format) the server lets `username` in with. */
  clientPrivateKey: string;
  username: string;
  /** How many SSH connections have been opened so far. */
  connections(): number;
  /** Ends every open connection, as a network drop would. */
  dropConnections(): void;
  stop(): Promise<void>;
}

const asParsedKey = (key: ParsedKey | Error): ParsedKey => {
  if (key instanceof Error) throw key;
  return key;
};

const toAttrs = (stats: Stats): Attributes => ({
  mode: Number(stats.mode),
  uid: Number(stats.uid),
  gid: Number(stats.gid),
  size: Number(stats.size),
  atime: Math.floor(Number(stats.atimeMs) / 1000),
  mtime: Math.floor(Number(stats.mtimeMs) / 1000),
});

/** Serves `root`; SFTP paths are taken as relative to it (`/a/b` → `root/a/b`). */
export async function startTestSftpServer(root: string): Promise<TestSftpServer> {
  const hostKeys = utils.generateKeyPairSync('ed25519');
  const clientKeys = utils.generateKeyPairSync('ed25519');
  const allowedKey = asParsedKey(utils.parseKey(clientKeys.public));
  const hostPublic = asParsedKey(utils.parseKey(hostKeys.public));
  const username = 'uploader';
  let connections = 0;
  const open = new Set<{ end(): void }>();

  const local = (path: string) => join(root, normalize(`/${path}`));

  const server = new Server({ hostKeys: [hostKeys.private] }, (client) => {
    connections += 1;
    open.add(client);
    client.on('close', () => open.delete(client));
    client.on('error', () => undefined);

    client.on('authentication', (ctx) => {
      const keyMatches =
        ctx.method === 'publickey' &&
        ctx.username === username &&
        ctx.key.algo === allowedKey.type &&
        ctx.key.data.equals(allowedKey.getPublicSSH());
      if (!keyMatches) {
        ctx.reject(['publickey']);
        return;
      }
      if (ctx.signature && ctx.blob && !allowedKey.verify(ctx.blob, ctx.signature, ctx.hashAlgo)) {
        ctx.reject();
        return;
      }
      ctx.accept();
    });

    client.on('ready', () => {
      client.on('session', (acceptSession) => {
        const session = acceptSession();
        session.on('sftp', (acceptSftp) => {
          const sftp = acceptSftp();
          const handles = new Map<string, number>();
          let next = 0;
          const fdOf = (handle: Buffer) => handles.get(handle.toString('hex'));
          const run = (reqId: number, work: () => void) => {
            try {
              work();
            } catch (error) {
              const code = (error as { code?: string }).code;
              sftp.status(
                reqId,
                code === 'ENOENT' ? STATUS_CODE.NO_SUCH_FILE : STATUS_CODE.FAILURE,
                String(error),
              );
            }
          };

          sftp
            .on('OPEN', (reqId, filename, flags) =>
              run(reqId, () => {
                const mode =
                  flags & OPEN_MODE.WRITE
                    ? `${flags & OPEN_MODE.TRUNC || flags & OPEN_MODE.CREAT ? 'w' : 'r+'}`
                    : 'r';
                const fd = openSync(local(filename), mode);
                const handle = Buffer.alloc(4);
                handle.writeUInt32BE(next++);
                handles.set(handle.toString('hex'), fd);
                sftp.handle(reqId, handle);
              }),
            )
            .on('WRITE', (reqId, handle, offset, data) =>
              run(reqId, () => {
                const fd = fdOf(handle);
                if (fd === undefined) throw new Error('bad handle');
                writeSync(fd, data, 0, data.length, offset);
                sftp.status(reqId, STATUS_CODE.OK);
              }),
            )
            .on('READ', (reqId, handle, offset, length) =>
              run(reqId, () => {
                const fd = fdOf(handle);
                if (fd === undefined) throw new Error('bad handle');
                const buffer = Buffer.alloc(length);
                const read = readSync(fd, buffer, 0, length, offset);
                if (read === 0) sftp.status(reqId, STATUS_CODE.EOF);
                else sftp.data(reqId, buffer.subarray(0, read));
              }),
            )
            .on('FSTAT', (reqId, handle) =>
              run(reqId, () => {
                const fd = fdOf(handle);
                if (fd === undefined) throw new Error('bad handle');
                sftp.attrs(reqId, toAttrs(fstatSync(fd)));
              }),
            )
            .on('CLOSE', (reqId, handle) =>
              run(reqId, () => {
                const fd = fdOf(handle);
                if (fd !== undefined) closeSync(fd);
                handles.delete(handle.toString('hex'));
                sftp.status(reqId, STATUS_CODE.OK);
              }),
            )
            .on('STAT', (reqId, path) =>
              run(reqId, () => sftp.attrs(reqId, toAttrs(statSync(local(path))))),
            )
            .on('LSTAT', (reqId, path) =>
              run(reqId, () => sftp.attrs(reqId, toAttrs(statSync(local(path))))),
            )
            .on('MKDIR', (reqId, path) =>
              run(reqId, () => {
                mkdirSync(local(path));
                sftp.status(reqId, STATUS_CODE.OK);
              }),
            )
            .on('RENAME', (reqId, from, to) =>
              run(reqId, () => {
                renameSync(local(from), local(to));
                sftp.status(reqId, STATUS_CODE.OK);
              }),
            )
            .on('REMOVE', (reqId, path) =>
              run(reqId, () => {
                unlinkSync(local(path));
                sftp.status(reqId, STATUS_CODE.OK);
              }),
            );
        });
      });
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (typeof address !== 'object' || address === null) throw new Error('no port');

  return {
    port: address.port,
    hostFingerprint: sshFingerprint(hostPublic.getPublicSSH()),
    clientPrivateKey: clientKeys.private,
    username,
    connections: () => connections,
    dropConnections() {
      for (const client of open) client.end();
    },
    stop: () =>
      new Promise<void>((resolve) => {
        for (const client of open) client.end();
        server.close(() => resolve());
      }),
  };
}
