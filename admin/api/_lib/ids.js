// Login identity handling.
//
// Firebase Auth only understands email addresses, but students should be able
// to sign in with just a roll number. So a roll number is mapped onto an
// internal address in a domain nobody can receive mail at:
//
//     2024-CS-101  ->  2024-cs-101@ruthpuaf.local
//
// The admin panel and the mobile app both use these helpers, so the same roll
// number always resolves to the same account.

export const INTERNAL_DOMAIN = 'ruthpuaf.local';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function looksLikeEmail(value) {
  return EMAIL_RE.test(String(value || '').trim());
}

/**
 * Turns a roll number into the local part of an internal address.
 * Keeps letters, digits, dot, underscore and hyphen; collapses anything else
 * into a single hyphen so "2024 / CS / 101" and "2024-CS-101" agree.
 */
export function slugifyRollNumber(rollNumber) {
  return String(rollNumber || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

/**
 * Resolves whatever the admin typed into the email Firebase Auth will store.
 * Returns { authEmail, loginId, kind } or throws with a readable message.
 */
export function resolveLoginId(rawLoginId) {
  const loginId = String(rawLoginId || '').trim();

  if (!loginId) {
    throw new Error('A login ID is required.');
  }

  if (looksLikeEmail(loginId)) {
    const authEmail = loginId.toLowerCase();
    if (authEmail.endsWith(`@${INTERNAL_DOMAIN}`)) {
      throw new Error(
        `@${INTERNAL_DOMAIN} is reserved for roll-number logins. ` +
          'Enter a roll number on its own, or use a different email domain.',
      );
    }
    return { authEmail, loginId: authEmail, kind: 'email' };
  }

  const slug = slugifyRollNumber(loginId);
  if (!slug) {
    throw new Error(
      'That roll number contains no usable characters. Use letters and digits, ' +
        'for example 2024-CS-101.',
    );
  }
  if (slug.length < 3) {
    throw new Error('A roll number must be at least 3 characters long.');
  }

  return {
    authEmail: `${slug}@${INTERNAL_DOMAIN}`,
    loginId,
    kind: 'rollNumber',
  };
}
