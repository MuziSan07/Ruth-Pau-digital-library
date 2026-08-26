// Caller authentication for the admin API.
//
// The panel sends the signed-in user's Firebase ID token as a bearer token.
// Every mutating endpoint runs it through requireAdmin() first, so holding a
// student account is never enough to reach these routes.

import { auth } from './firebaseAdmin.js';
import { fail } from './http.js';

function bearerToken(req) {
  const header = req.headers?.authorization || '';
  const [scheme, token] = header.split(' ');
  if (!token || scheme.toLowerCase() !== 'bearer') return null;
  return token.trim();
}

/**
 * Verifies the caller holds a valid admin token.
 * Responds and returns null when they do not — callers should bail out.
 */
export async function requireAdmin(req, res) {
  const token = bearerToken(req);

  if (!token) {
    fail(res, 401, 'Missing authentication. Sign in to the admin panel again.');
    return null;
  }

  let decoded;
  try {
    // checkRevoked: a deleted or disabled admin stops working immediately
    // rather than staying valid until the token's natural expiry.
    decoded = await auth().verifyIdToken(token, true);
  } catch (error) {
    const expired = error?.code === 'auth/id-token-expired';
    fail(
      res,
      401,
      expired
        ? 'Your session expired. Sign in again.'
        : 'Invalid authentication token.',
    );
    return null;
  }

  if (decoded.role !== 'admin') {
    fail(res, 403, 'This action requires an administrator account.');
    return null;
  }

  return decoded;
}
