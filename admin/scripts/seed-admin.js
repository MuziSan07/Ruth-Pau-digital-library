// Creates (or repairs) the first administrator account.
//
// Run from the admin/ directory:
//   node scripts/seed-admin.js you@example.com "a-strong-password" "Your Name"
//
// This is deliberately a local script rather than an HTTP endpoint — an
// unauthenticated "create an admin" route on the public internet is exactly
// the kind of thing that gets a project taken over. It needs the service
// account key at admin/.secrets/firebase-admin.json.
//
// Safe to run more than once: an existing account is promoted to admin and its
// password reset, rather than erroring.

import { auth, db } from '../api/_lib/firebaseAdmin.js';
import { looksLikeEmail } from '../api/_lib/ids.js';

const [, , emailArg, passwordArg, ...nameParts] = process.argv;

function bail(message) {
  console.error(`\n  ✖ ${message}\n`);
  process.exit(1);
}

if (!emailArg || !passwordArg) {
  bail(
    'Usage: node scripts/seed-admin.js <email> <password> [full name]\n' +
      '    e.g. node scripts/seed-admin.js admin@ruthpuaf.com "SomethingLong123" "Ruth Puaf"',
  );
}

const email = emailArg.trim().toLowerCase();
const password = passwordArg;
const displayName = nameParts.join(' ').trim() || 'Administrator';

if (!looksLikeEmail(email)) {
  bail(`"${email}" is not a valid email address.`);
}
if (password.length < 8) {
  bail('Choose an admin password of at least 8 characters.');
}

const run = async () => {
  let user;
  let created = false;

  try {
    user = await auth().createUser({
      email,
      password,
      displayName,
      emailVerified: true,
    });
    created = true;
  } catch (error) {
    if (error?.code !== 'auth/email-already-exists') throw error;

    user = await auth().getUserByEmail(email);
    await auth().updateUser(user.uid, { password, displayName });
    console.log(`  → ${email} already existed; password and name updated.`);
  }

  // This claim is what the Firestore rules and the admin API check.
  await auth().setCustomUserClaims(user.uid, { role: 'admin' });

  // Any session signed in before the claim existed still carries the old
  // token, so force a fresh sign-in.
  await auth().revokeRefreshTokens(user.uid);

  await db().collection('users').doc(user.uid).set(
    {
      role: 'admin',
      name: displayName,
      loginId: email,
      loginKind: 'email',
      authEmail: email,
      disabled: false,
      createdAt: new Date(),
    },
    { merge: true },
  );

  console.log(`
  ✔ Administrator ready

    Email : ${email}
    Name  : ${displayName}
    UID   : ${user.uid}
    Status: ${created ? 'created' : 'updated'}

  Sign in to the admin panel with these credentials.
`);
};

run().catch((error) => {
  bail(error?.message || String(error));
});
