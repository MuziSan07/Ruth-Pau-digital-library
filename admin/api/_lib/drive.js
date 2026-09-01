// Google Drive access for book files.
//
// Why OAuth and not a service account: a service account has no Drive storage
// quota of its own, so uploads into a personal (non-Workspace) account fail
// with "Service Accounts do not have storage quota". Instead the owner grants
// consent once, and we keep the resulting refresh token in an environment
// variable. Refresh tokens do not expire for published apps; a token issued
// while the OAuth consent screen is still in "Testing" mode expires after
// 7 days, which is why docs/SETUP.md walks through publishing it.

import { google } from 'googleapis';

const RESUMABLE_ENDPOINT =
  'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true';

// Formats the reader can open, plus the archive formats worth keeping around.
export const ALLOWED_MIME_TYPES = {
  'application/pdf': '.pdf',
  'application/epub+zip': '.epub',
  'application/x-mobipocket-ebook': '.mobi',
  'application/vnd.amazon.ebook': '.azw3',
  'text/plain': '.txt',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    '.docx',
};

export function requiredEnv(name) {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(
      `${name} is not configured. Complete the Google Drive section of ` +
        'docs/SETUP.md, then add it to your environment variables.',
    );
  }
  return value.trim();
}

function oauthClient() {
  const client = new google.auth.OAuth2(
    requiredEnv('GOOGLE_CLIENT_ID'),
    requiredEnv('GOOGLE_CLIENT_SECRET'),
    // Only used during the one-time consent flow; unused for refreshes.
    'https://developers.google.com/oauthplayground',
  );
  client.setCredentials({ refresh_token: requiredEnv('GOOGLE_REFRESH_TOKEN') });
  return client;
}

export function driveClient() {
  return google.drive({ version: 'v3', auth: oauthClient() });
}

async function accessToken() {
  const { token } = await oauthClient().getAccessToken();
  if (!token) {
    throw new Error(
      'Google refused to issue an access token. The refresh token is likely ' +
        'expired or revoked — re-run the consent step in docs/SETUP.md.',
    );
  }
  return token;
}

/**
 * Opens a resumable upload session and returns the URL the browser will PUT to.
 *
 * The file bytes deliberately never pass through this function: Vercel caps
 * serverless request bodies at 4.5 MB, which most books exceed. The browser
 * streams straight to Google instead, so file size is effectively unlimited.
 */
export async function createResumableUploadSession({
  fileName,
  mimeType,
  fileSize,
  origin,
}) {
  const folderId = requiredEnv('GOOGLE_DRIVE_FOLDER_ID');
  const token = await accessToken();

  const response = await fetch(RESUMABLE_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': mimeType,
      ...(fileSize ? { 'X-Upload-Content-Length': String(fileSize) } : {}),
      // Required when the session is opened here but the bytes are sent from a
      // browser. Google binds the session to this origin and only then returns
      // CORS headers for it on the upload request. Without this the browser
      // blocks the PUT, which surfaces as a bare network error with no status,
      // indistinguishable from the connection actually being down.
      ...(origin ? { Origin: origin } : {}),
    },
    body: JSON.stringify({ name: fileName, parents: [folderId], mimeType }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(
      `Google Drive refused the upload session (${response.status}): ${detail}`,
    );
  }

  const uploadUrl = response.headers.get('location');
  if (!uploadUrl) {
    throw new Error(
      'Google Drive did not return an upload URL. Check that the Drive API is ' +
        'enabled for this project.',
    );
  }

  return uploadUrl;
}

/**
 * Grants read access to anyone holding the link.
 *
 * The catalogue itself is gated by Firebase Auth, so a student must sign in to
 * discover a file id. Link-readable is what lets the app download the bytes
 * without shipping Google credentials inside the APK.
 */
export async function shareFilePublicly(fileId) {
  const drive = driveClient();

  await drive.permissions.create({
    fileId,
    requestBody: { role: 'reader', type: 'anyone' },
    supportsAllDrives: true,
  });

  const { data } = await drive.files.get({
    fileId,
    fields: 'id, name, size, mimeType, webViewLink',
    supportsAllDrives: true,
  });

  return data;
}

export async function deleteDriveFile(fileId) {
  try {
    await driveClient().files.delete({ fileId, supportsAllDrives: true });
    return true;
  } catch (error) {
    // Already gone is a success from the caller's point of view.
    if (error?.code === 404) return true;
    throw error;
  }
}

/**
 * Direct-download URL used by the mobile app.
 *
 * Uses drive.usercontent.google.com with confirm=t rather than the older
 * drive.google.com/uc form: past roughly 100 MB the old endpoint serves an
 * HTML "can't scan this file for viruses" interstitial instead of the bytes,
 * and the app would silently save that page as the book.
 */
export function downloadUrl(fileId) {
  return `https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=t`;
}
