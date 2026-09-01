// POST /api/books/upload-session
//
// Step 1 of a two-step upload. Returns a Google-issued URL that the browser
// PUTs the file bytes to directly, bypassing Vercel's 4.5 MB body limit.
// Step 2 is POST /api/books, which records the finished file in the catalogue.

import { requireAdmin } from '../_lib/auth.js';
import {
  fail,
  methodNotAllowed,
  ok,
  readJson,
  withErrorHandling,
} from '../_lib/http.js';
import {
  ALLOWED_MIME_TYPES,
  createResumableUploadSession,
} from '../_lib/drive.js';

// Drive itself has no meaningful per-file limit here; this is a sanity guard
// against a mis-selected file consuming the account's 15 GB.
const MAX_FILE_BYTES = 512 * 1024 * 1024; // 512 MB

async function handler(req, res) {
  if (methodNotAllowed(req, res, ['POST'])) return;

  const adminUser = await requireAdmin(req, res);
  if (!adminUser) return;

  const { fileName, mimeType, fileSize } = readJson(req);

  const cleanName = String(fileName || '').trim();
  if (!cleanName) return fail(res, 400, 'A file name is required.');

  if (!ALLOWED_MIME_TYPES[mimeType]) {
    return fail(
      res,
      400,
      `"${mimeType || 'unknown'}" is not a supported book format.`,
      { supported: Object.values(ALLOWED_MIME_TYPES) },
    );
  }

  const size = Number(fileSize) || 0;
  if (size > MAX_FILE_BYTES) {
    return fail(
      res,
      413,
      `That file is ${(size / 1024 / 1024).toFixed(0)} MB. The limit is ` +
        `${MAX_FILE_BYTES / 1024 / 1024} MB.`,
    );
  }

  // The browser sends the bytes, so Google must bind the session to the
  // browser's origin rather than to this function.
  const origin =
    req.headers?.origin ||
    (req.headers?.host ? `https://${req.headers.host}` : null);

  const uploadUrl = await createResumableUploadSession({
    fileName: cleanName,
    mimeType,
    fileSize: size,
    origin,
  });

  ok(res, { uploadUrl });
}

export default withErrorHandling(handler);
