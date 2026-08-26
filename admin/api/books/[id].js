// PATCH  /api/books/:id  — edit the title or extract
// DELETE /api/books/:id  — remove the book and its Drive file

import { db } from '../_lib/firebaseAdmin.js';
import { requireAdmin } from '../_lib/auth.js';
import {
  fail,
  methodNotAllowed,
  ok,
  readJson,
  withErrorHandling,
} from '../_lib/http.js';
import { deleteDriveFile } from '../_lib/drive.js';

const MAX_TITLE_LENGTH = 200;
const MAX_EXTRACT_LENGTH = 5000;

async function loadBook(id, res) {
  const ref = db().collection('books').doc(id);
  const snap = await ref.get();
  if (!snap.exists) {
    fail(res, 404, 'No such book.');
    return null;
  }
  return { ref, data: snap.data() };
}

async function patchBook(req, res, id) {
  const book = await loadBook(id, res);
  if (!book) return;

  const { title, extract } = readJson(req);
  const updates = {};

  if (title !== undefined) {
    const cleanTitle = String(title).trim();
    if (!cleanTitle) return fail(res, 400, 'The title cannot be empty.');
    if (cleanTitle.length > MAX_TITLE_LENGTH) {
      return fail(res, 400, `The title must be under ${MAX_TITLE_LENGTH} characters.`);
    }
    updates.title = cleanTitle;
  }

  if (extract !== undefined) {
    const cleanExtract = String(extract).trim();
    if (cleanExtract.length > MAX_EXTRACT_LENGTH) {
      return fail(
        res,
        400,
        `The extract must be under ${MAX_EXTRACT_LENGTH} characters.`,
      );
    }
    updates.extract = cleanExtract;
  }

  if (!Object.keys(updates).length) {
    return fail(res, 400, 'Nothing to update.');
  }

  updates.updatedAt = new Date();
  await book.ref.update(updates);

  ok(res, { id, updated: Object.keys(updates) });
}

async function deleteBook(req, res, id) {
  const book = await loadBook(id, res);
  if (!book) return;

  // Catalogue entry first: if the Drive delete then fails, students already
  // cannot see the book, and the leftover file is visible in the Drive folder
  // rather than silently orphaned.
  await book.ref.delete();

  let fileRemoved = true;
  let warning = null;

  if (book.data.fileId) {
    try {
      await deleteDriveFile(book.data.fileId);
    } catch (error) {
      fileRemoved = false;
      warning =
        `The book was removed from the catalogue, but its Drive file could ` +
        `not be deleted (${error.message}). Delete "${book.data.fileName}" ` +
        `from the Drive folder by hand.`;
    }
  }

  ok(res, { id, deleted: true, fileRemoved, ...(warning ? { warning } : {}) });
}

async function handler(req, res) {
  if (methodNotAllowed(req, res, ['PATCH', 'DELETE'])) return;

  const adminUser = await requireAdmin(req, res);
  if (!adminUser) return;

  const id = String(req.query?.id || '').trim();
  if (!id) return fail(res, 400, 'Missing book id.');

  if (req.method === 'PATCH') return patchBook(req, res, id);
  return deleteBook(req, res, id);
}

export default withErrorHandling(handler);
