// Firebase Admin SDK bootstrap, shared by every serverless function.
//
// Credentials are resolved in this order:
//   1. FIREBASE_SERVICE_ACCOUNT  — the full service-account JSON as one string.
//      This is what you paste into Vercel's environment variables.
//   2. admin/.secrets/firebase-admin.json — local development only. Gitignored.
//
// The Admin SDK bypasses all Firestore security rules, so this credential is
// the keys to the kingdom. It must never reach the browser bundle: files under
// api/ are server-only, and the variable is deliberately NOT prefixed VITE_.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cert, getApp, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const LOCAL_KEY_PATH = '.secrets/firebase-admin.json';

function loadServiceAccount() {
  const inline = process.env.FIREBASE_SERVICE_ACCOUNT;

  if (inline && inline.trim()) {
    try {
      return JSON.parse(inline);
    } catch {
      throw new Error(
        'FIREBASE_SERVICE_ACCOUNT is set but is not valid JSON. ' +
          'Paste the entire service-account file contents, including the ' +
          'outer braces.',
      );
    }
  }

  try {
    const path = resolve(process.cwd(), LOCAL_KEY_PATH);
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    throw new Error(
      'No Firebase credentials found. Either set FIREBASE_SERVICE_ACCOUNT ' +
        `(production) or save the service-account key to admin/${LOCAL_KEY_PATH} ` +
        '(local development). See docs/SETUP.md step 1.5.',
    );
  }
}

function adminApp() {
  if (getApps().length) return getApp();

  const serviceAccount = loadServiceAccount();

  // Private keys pasted into dashboards often arrive with literal "\n"
  // sequences instead of real newlines, which makes the JWT signing fail
  // with an opaque error. Normalise before handing it to the SDK.
  if (typeof serviceAccount.private_key === 'string') {
    serviceAccount.private_key = serviceAccount.private_key.replace(
      /\\n/g,
      '\n',
    );
  }

  return initializeApp({
    credential: cert(serviceAccount),
    projectId: serviceAccount.project_id,
  });
}

export const auth = () => getAuth(adminApp());
export const db = () => getFirestore(adminApp());
