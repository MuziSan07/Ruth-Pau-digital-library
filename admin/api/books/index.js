// GET  /api/books  — list the catalogue
// POST /api/books  — record a finished Drive upload as a book
//
// POST is step 2 of the upload flow: the browser has already streamed the file
// to Drive via the session from /api/books/upload-session and hands back the
// resulting file id.

import { db } from '../_lib/firebaseAdmin.js';
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
  deleteDriveFile,
  downloadUrl,
  shareFilePublicly,
} from '../_lib/drive.js';

const MAX_TITLE_LENGTH = 200;
const MAX_EXTRACT_LENGTH = 5000;

async function listBooks(req, res) {
  const snapshot = await db()
    .collection('books')
    .orderBy('createdAt', 'desc')
    .get();

  ok(res, {
    books: snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
  });
}

async function createBook(req, res, adminUser) {
  const { title, extract, fileId, fileName, mimeType } = readJson(req);

  const cleanTitle = String(title || '').trim();
  if (!cleanTitle) return fail(res, 400, 'The book title is required.');
  if (cleanTitle.length > MAX_TITLE_LENGTH) {
    return fail(res, 400, `The title must be under ${MAX_TITLE_LENGTH} characters.`);
  }

  const cleanExtract = String(extract || '').trim();
  if (cleanExtract.length > MAX_EXTRACT_LENGTH) {
    return fail(
      res,
      400,
      `The extract must be under ${MAX_EXTRACT_LENGTH} characters.`,
    );
  }

  const cleanFileId = String(fileId || '').trim();
  if (!cleanFileId) {
    return fail(res, 400, 'Missing the uploaded file id. Upload the file first.');
  }

  if (mimeType && !ALLOWED_MIME_TYPES[mimeType]) {
    return fail(res, 400, `"${mimeType}" is not a supported book format.`);
  }

  // Make the file link-readable and read back its authoritative metadata —
  // trusting the browser's reported size would let a client lie about it.
  let driveFile;
  try {
    driveFile = await shareFilePublicly(cleanFileId);
  } catch (error) {
    return fail(
      res,
      502,
      `The file uploaded but could not be shared: ${error.message}`,
    );
  }

  const book = {
    title: cleanTitle,
    extract: cleanExtract,
    fileId: cleanFileId,
    fileName: driveFile.name || String(fileName || '').trim(),
    mimeType: driveFile.mimeType || mimeType || null,
    fileSize: Number(driveFile.size) || null,
    downloadUrl: downloadUrl(cleanFileId),
    webViewLink: driveFile.webViewLink || null,
    createdAt: new Date(),
    createdBy: adminUser.uid,
  };

  try {
    const ref = await db().collection('books').add(book);
    ok(res, { book: { id: ref.id, ...book } });
  } catch (error) {
    // Don't leave an orphaned file sitting in Drive that no catalogue entry
    // points at — nothing would ever clean it up.
    await deleteDriveFile(cleanFileId).catch(() => {});
    throw error;
  }
}

async function handler(req, res) {
  if (methodNotAllowed(req, res, ['GET', 'POST'])) return;

  const adminUser = await requireAdmin(req, res);
  if (!adminUser) return;

  if (req.method === 'GET') return listBooks(req, res);
  return createBook(req, res, adminUser);
}

export default withErrorHandling(handler);
