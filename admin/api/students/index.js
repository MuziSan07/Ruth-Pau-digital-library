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

const MIN_PASSWORD_LENGTH = 6;

async function listStudents(req, res) {
  const snapshot = await db()
    .collection('users')
    .where('role', '==', 'student')
    .get();

  const students = snapshot.docs
    .map((doc) => ({ uid: doc.id, ...doc.data() }))
    .sort((a, b) => (b.createdAt?._seconds || 0) - (a.createdAt?._seconds || 0));

  ok(res, { students });
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
    loginId: cleanLoginId,
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
