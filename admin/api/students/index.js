// GET  /api/students  — list every student account
// POST /api/students  — create a student account and issue credentials
//
// Account creation has to happen here rather than in the browser: calling the
// client SDK's createUser would sign the admin OUT and in as the new student.
// The Admin SDK creates the account without touching the caller's session, and
// is also the only way to attach the { role } custom claim the rules rely on.

import { auth, db } from '../_lib/firebaseAdmin.js';
import { requireAdmin } from '../_lib/auth.js';
import {
  fail,
  methodNotAllowed,
  ok,
  readJson,
  withErrorHandling,
} from '../_lib/http.js';
import { resolveLoginId } from '../_lib/ids.js';
import {
  applyCursor,
  fetchPage,
  normalise,
  readPaging,
} from '../_lib/search.js';

const MIN_PASSWORD_LENGTH = 6;

const toStudent = (doc) => ({ uid: doc.id, ...doc.data() });

/**
 * Searching by name and by roll number are two different range scans, so both
 * run and the results are merged. A roll number match is listed first because
 * an admin typing one is looking for that exact student.
 */
async function searchStudents(collection, term, limit) {
  const prefix = normalise(term);
  const high = prefix + '';

  const [byLogin, byName] = await Promise.all([
    collection
      .where('role', '==', 'student')
      .orderBy('loginIdLower')
      .startAt(prefix)
      .endAt(high)
      .limit(limit)
      .get(),
    collection
      .where('role', '==', 'student')
      .orderBy('nameLower')
      .startAt(prefix)
      .endAt(high)
      .limit(limit)
      .get(),
  ]);

  const seen = new Set();
  const merged = [];
  for (const doc of [...byLogin.docs, ...byName.docs]) {
    if (seen.has(doc.id)) continue;
    seen.add(doc.id);
    merged.push(toStudent(doc));
  }

  return merged.slice(0, limit);
}

async function listStudents(req, res) {
  const { limit, cursor, q } = readPaging(req);
  const collection = db().collection('users');

  if (q) {
    // Search returns a single merged page; paging through two interleaved
    // range scans would give an unstable order.
    const students = await searchStudents(collection, q, limit);
    return ok(res, { students, nextCursor: null, hasMore: false, query: q });
  }

  const base = collection
    .where('role', '==', 'student')
    .orderBy('createdAt', 'desc');

  const query = await applyCursor(base, collection, cursor);
  const page = await fetchPage(query, limit, toStudent);

  ok(res, {
    students: page.items,
    nextCursor: page.nextCursor,
    hasMore: page.hasMore,
    query: null,
  });
}

async function createStudent(req, res, adminUser) {
  const { name, loginId, password } = readJson(req);

  const displayName = String(name || '').trim();
  if (!displayName) {
    return fail(res, 400, "The student's name is required.");
  }

  if (String(password || '').length < MIN_PASSWORD_LENGTH) {
    return fail(
      res,
      400,
      `The password must be at least ${MIN_PASSWORD_LENGTH} characters long.`,
    );
  }

  let resolved;
  try {
    resolved = resolveLoginId(loginId);
  } catch (error) {
    return fail(res, 400, error.message);
  }

  const { authEmail, loginId: cleanLoginId, kind } = resolved;

  let userRecord;
  try {
    userRecord = await auth().createUser({
      email: authEmail,
      password,
      displayName,
      // Internal roll-number addresses can never receive mail, so marking them
      // verified avoids Firebase treating them as pending forever.
      emailVerified: kind === 'rollNumber',
    });
  } catch (error) {
    if (error?.code === 'auth/email-already-exists') {
      return fail(
        res,
        409,
        kind === 'rollNumber'
          ? `A student with roll number "${cleanLoginId}" already exists.`
          : `An account already uses ${authEmail}.`,
      );
    }
    if (error?.code === 'auth/invalid-password') {
      return fail(res, 400, 'Firebase rejected that password as too weak.');
    }
    throw error;
  }

  // The rules read request.auth.token.role, so this claim is what actually
  // grants catalogue access. Without it the student can sign in but sees
  // nothing.
  await auth().setCustomUserClaims(userRecord.uid, { role: 'student' });

  const profile = {
    role: 'student',
    name: displayName,
    // Search keys, kept in step with their source fields on every write.
    nameLower: normalise(displayName),
    loginId: cleanLoginId,
    loginIdLower: normalise(cleanLoginId),
    loginKind: kind,
    authEmail,
    disabled: false,
    createdAt: new Date(),
    createdBy: adminUser.uid,
  };

  await db().collection('users').doc(userRecord.uid).set(profile);

  ok(res, {
    student: { uid: userRecord.uid, ...profile },
    // Echoed once so the admin can hand the credentials over. Never stored.
    credentials: {
      loginId: cleanLoginId,
      password,
      note:
        kind === 'rollNumber'
          ? `The student signs in with the roll number "${cleanLoginId}". ` +
            `Internally this is ${authEmail} — they never need to type that.`
          : `The student signs in with ${authEmail}.`,
    },
  });
}

async function handler(req, res) {
  if (methodNotAllowed(req, res, ['GET', 'POST'])) return;

  const adminUser = await requireAdmin(req, res);
  if (!adminUser) return;

  if (req.method === 'GET') return listStudents(req, res);
  return createStudent(req, res, adminUser);
}

export default withErrorHandling(handler);
