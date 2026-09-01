// Temporary deployment diagnostic. Safe to delete once the API is healthy.
//
// Deliberately has NO top level imports: if a dependency fails to load in the
// serverless runtime, a normal endpoint crashes with FUNCTION_INVOCATION_FAILED
// and no usable message. This one loads each dependency inside a try/catch and
// reports which one failed and why.
//
// It reports only whether configuration values are PRESENT and their length,
// never their contents.

export default async function handler(req, res) {
  const report = {
    node: process.version,
    region: process.env.VERCEL_REGION || null,
    env: {},
    imports: {},
    checks: {},
  };

  const expected = [
    'FIREBASE_SERVICE_ACCOUNT',
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'GOOGLE_REFRESH_TOKEN',
    'GOOGLE_DRIVE_FOLDER_ID',
  ];

  for (const name of expected) {
    const value = process.env[name];
    report.env[name] = value
      ? { present: true, length: value.length }
      : { present: false };
  }

  // Is the service account value actually parseable JSON with the right shape?
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      report.checks.serviceAccount = {
        parses: true,
        type: parsed.type || null,
        hasProjectId: Boolean(parsed.project_id),
        hasClientEmail: Boolean(parsed.client_email),
        hasPrivateKey: Boolean(parsed.private_key),
        privateKeyHasRealNewlines: Boolean(
          parsed.private_key && parsed.private_key.includes('\n'),
        ),
        privateKeyHasEscapedNewlines: Boolean(
          parsed.private_key && parsed.private_key.includes('\\n'),
        ),
      };
    } catch (error) {
      report.checks.serviceAccount = { parses: false, error: error.message };
    }
  }

  // Load each dependency separately so one failure does not hide the others.
  const probe = async (label, loader) => {
    try {
      await loader();
      report.imports[label] = 'ok';
    } catch (error) {
      report.imports[label] = {
        failed: error?.message || String(error),
        code: error?.code || null,
      };
    }
  };

  await probe('firebase-admin/app', () => import('firebase-admin/app'));
  await probe('firebase-admin/auth', () => import('firebase-admin/auth'));
  await probe('firebase-admin/firestore', () => import('firebase-admin/firestore'));
  await probe('googleapis', () => import('googleapis'));
  await probe('_lib/http.js', () => import('./_lib/http.js'));
  await probe('_lib/ids.js', () => import('./_lib/ids.js'));
  await probe('_lib/firebaseAdmin.js', () => import('./_lib/firebaseAdmin.js'));
  await probe('_lib/drive.js', () => import('./_lib/drive.js'));
  await probe('_lib/auth.js', () => import('./_lib/auth.js'));

  // If the modules load, can the Admin SDK actually initialise?
  try {
    const { db } = await import('./_lib/firebaseAdmin.js');
    const snapshot = await db().collection('books').limit(1).get();
    report.checks.firestore = { ok: true, sampleSize: snapshot.size };
  } catch (error) {
    report.checks.firestore = { ok: false, error: error?.message || String(error) };
  }

  res.status(200).json(report);
}
