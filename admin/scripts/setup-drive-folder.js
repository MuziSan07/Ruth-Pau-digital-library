// Creates the Drive folder that book files live in, and prints its id.
//
// Run from the admin/ directory once GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
// and GOOGLE_REFRESH_TOKEN are set in .env.local:
//
//   node --env-file=.env.local scripts/setup-drive-folder.js
//
// Why the app creates the folder rather than you picking an existing one:
// we request the narrow `drive.file` scope, which grants access only to files
// this app created. That keeps the credential from being able to read the rest
// of your Drive — but it also means a folder you made by hand would be
// invisible to it. Letting the app create the folder gets both properties.

import { google } from 'googleapis';

const FOLDER_NAME = 'Digital Library — Ruth Puaf';
const FOLDER_MIME = 'application/vnd.google-apps.folder';

function bail(message) {
  console.error(`\n  ✖ ${message}\n`);
  process.exit(1);
}

for (const key of [
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'GOOGLE_REFRESH_TOKEN',
]) {
  if (!process.env[key]) {
    bail(
      `${key} is not set.\n    Add it to admin/.env.local, then re-run with:\n` +
        '    node --env-file=.env.local scripts/setup-drive-folder.js',
    );
  }
}

const auth = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  'https://developers.google.com/oauthplayground',
);
auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });

const drive = google.drive({ version: 'v3', auth });

const run = async () => {
  // Re-running should not litter the account with duplicate folders.
  const existing = await drive.files.list({
    q: `mimeType='${FOLDER_MIME}' and name='${FOLDER_NAME}' and trashed=false`,
    fields: 'files(id, name)',
    spaces: 'drive',
  });

  if (existing.data.files?.length) {
    const folder = existing.data.files[0];
    console.log(`
  ✔ Folder already exists

    GOOGLE_DRIVE_FOLDER_ID=${folder.id}

    https://drive.google.com/drive/folders/${folder.id}
`);
    return;
  }

  const { data } = await drive.files.create({
    requestBody: { name: FOLDER_NAME, mimeType: FOLDER_MIME },
    fields: 'id',
  });

  console.log(`
  ✔ Folder created

    Add this line to admin/.env.local and to your Vercel environment variables:

    GOOGLE_DRIVE_FOLDER_ID=${data.id}

    https://drive.google.com/drive/folders/${data.id}
`);
};

run().catch((error) => {
  const reason = error?.response?.data?.error_description || error?.message;

  if (String(reason).includes('invalid_grant')) {
    bail(
      'Google rejected the refresh token (invalid_grant).\n' +
        '    Usual causes: the token was copied incompletely, or the OAuth\n' +
        '    consent screen is still in "Testing" mode, which expires tokens\n' +
        '    after 7 days. Publish the app, then generate a new token.',
    );
  }
  bail(reason || String(error));
});
