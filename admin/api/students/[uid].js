// PATCH  /api/students/:uid  — reset password, or enable/disable access
// DELETE /api/students/:uid  — remove the account entirely

import { auth, db } from '../_lib/firebaseAdmin.js';
import { requireAdmin } from '../_lib/auth.js';
import {
  fail,
  methodNotAllowed,
  ok,
  readJson,
  withErrorHandling,
} from '../_lib/http.js';

const MIN_PASSWORD_LENGTH = 6;

async function loadStudent(uid, res) {
  const ref = db().collection('users').doc(uid);
  const snap = await ref.get();

  if (!snap.exists) {
    fail(res, 404, 'No such student.');
    return null;
  }
  if (snap.data().role !== 'student') {
    // Guards against an admin account being deleted through this route.
    fail(res, 403, 'This endpoint only manages student accounts.');
    return null;
  }
  return { ref, data: snap.data() };
}

async function patchStudent(req, res, uid) {
  const student = await loadStudent(uid, res);
  if (!student) return;

  const { password, disabled, name } = readJson(req);
  const changes = [];

  if (password !== undefined) {
    if (String(password).length < MIN_PASSWORD_LENGTH) {
      return fail(
        res,
        400,
        `The password must be at least ${MIN_PASSWORD_LENGTH} characters long.`,
      );
    }
    await auth().updateUser(uid, { password });
    // Force existing sessions to re-authenticate with the new password —
    // otherwise a phone already signed in keeps working after a reset.
    await auth().revokeRefreshTokens(uid);
    changes.push('password');
  }

  if (disabled !== undefined) {
    const isDisabled = Boolean(disabled);
    await auth().updateUser(uid, { disabled: isDisabled });
    if (isDisabled) await auth().revokeRefreshTokens(uid);
    await student.ref.update({ disabled: isDisabled });
    changes.push(isDisabled ? 'disabled' : 'enabled');
  }

  if (name !== undefined) {
    const displayName = String(name).trim();
    if (!displayName) return fail(res, 400, 'The name cannot be empty.');
    await auth().updateUser(uid, { displayName });
    await student.ref.update({ name: displayName });
    changes.push('name');
  }

  if (!changes.length) {
    return fail(res, 400, 'Nothing to update.');
  }

  ok(res, { uid, updated: changes });
}

async function deleteStudent(req, res, uid) {
  const student = await loadStudent(uid, res);
  if (!student) return;

  // Auth record first: if this succeeds but the Firestore delete fails, the
  // account can no longer sign in, which is the safe direction to fail in.
  try {
    await auth().deleteUser(uid);
  } catch (error) {
    if (error?.code !== 'auth/user-not-found') throw error;
  }

  await student.ref.delete();

  ok(res, { uid, deleted: true });
}

async function handler(req, res) {
  if (methodNotAllowed(req, res, ['PATCH', 'DELETE'])) return;

  const adminUser = await requireAdmin(req, res);
  if (!adminUser) return;

  const uid = String(req.query?.uid || '').trim();
  if (!uid) return fail(res, 400, 'Missing student id.');

  if (req.method === 'PATCH') return patchStudent(req, res, uid);
  return deleteStudent(req, res, uid);
}

export default withErrorHandling(handler);
