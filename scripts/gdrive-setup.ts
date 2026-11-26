/**
 * One-time setup for STORAGE_DRIVER=gdrive (`bun run storage:gdrive-setup`).
 *
 * Signs in to Google once, in your browser, as the account whose Drive will
 * hold the uploads, creates the folder for them, and prints the two values
 * the server needs: GDRIVE_REFRESH_TOKEN and GDRIVE_FOLDER_ID.
 *
 * Before running, create an OAuth client of type "Desktop app" in Google
 * Cloud Console (with the Drive API enabled) and put its id and secret in
 * `.env` as GDRIVE_CLIENT_ID / GDRIVE_CLIENT_SECRET.
 *
 * It asks for the `drive.file` scope only: the server can touch the files it
 * uploads itself and nothing else in the Drive — which is also why the folder
 * is created here rather than picked from existing ones.
 */
const clientId = process.env.GDRIVE_CLIENT_ID;
const clientSecret = process.env.GDRIVE_CLIENT_SECRET;
if (!clientId || !clientSecret) {
  console.error('Set GDRIVE_CLIENT_ID and GDRIVE_CLIENT_SECRET (in .env) first.');
  process.exit(1);
}
const folderName = process.argv[2] ?? 'uploads';

const state = crypto.randomUUID();
let finish: (code: string) => void = () => undefined;
const codeReceived = new Promise<string>((resolve) => (finish = resolve));

// Google sends the browser back here with the code (the "loopback" redirect
// a Desktop-app client is allowed on any port).
const server = Bun.serve({
  port: 0,
  hostname: '127.0.0.1',
  fetch(req) {
    const params = new URL(req.url).searchParams;
    const code = params.get('code');
    if (!code || params.get('state') !== state) {
      return new Response(`Sign-in did not finish: ${params.get('error') ?? 'no code'}`, {
        status: 400,
      });
    }
    finish(code);
    return new Response('Done — go back to the terminal.');
  },
});
const redirectUri = `http://127.0.0.1:${server.port}`;

console.log('Open this address in a browser and sign in with the Google account to store in:\n');
console.log(
  `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/drive.file',
    access_type: 'offline', // a refresh token, not just a one-hour access token
    prompt: 'consent', // …every time, even if this account consented before
    state,
  })}\n`,
);

const code = await codeReceived;
await server.stop();

async function google<T>(what: string, url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    console.error(`${what} failed: HTTP ${response.status} ${await response.text()}`);
    process.exit(1);
  }
  return (await response.json()) as T;
}

const tokens = await google<{ access_token: string; refresh_token?: string }>(
  'Trading the code for tokens',
  'https://oauth2.googleapis.com/token',
  {
    method: 'POST',
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
    }),
  },
);
if (!tokens.refresh_token) {
  console.error('Google returned no refresh token.');
  process.exit(1);
}

const folder = await google<{ id: string }>(
  'Creating the folder',
  'https://www.googleapis.com/drive/v3/files?fields=id',
  {
    method: 'POST',
    headers: {
      authorization: `Bearer ${tokens.access_token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ name: folderName, mimeType: 'application/vnd.google-apps.folder' }),
  },
);

console.log(`Created the Drive folder "${folderName}". Add these to the server's environment`);
console.log('(they are secrets — never commit them):\n');
console.log(`GDRIVE_REFRESH_TOKEN=${tokens.refresh_token}`);
console.log(`GDRIVE_FOLDER_ID=${folder.id}`);
