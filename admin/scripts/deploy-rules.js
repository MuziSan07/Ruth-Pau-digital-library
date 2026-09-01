// Publishes firestore.rules to the live project.
//
//   node --env-file=.env.local scripts/deploy-rules.js
//
// Uses the Firebase Rules REST API directly with the service account, because
// `firebase deploy` first checks that the Firestore API is enabled and the
// Admin SDK service account is not granted permission to answer that.
//
// Publishing is two steps: create an immutable ruleset from the source, then
// point the cloud.firestore release at it.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { GoogleAuth } from 'google-auth-library';

const RULES_PATH = resolve(process.cwd(), '../firestore.rules');

function credentials() {
  const inline = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (inline && inline.trim()) return JSON.parse(inline);
  return JSON.parse(
    readFileSync(resolve(process.cwd(), '.secrets/firebase-admin.json'), 'utf8'),
  );
}

const run = async () => {
  const account = credentials();
  const projectId = account.project_id;
  const source = readFileSync(RULES_PATH, 'utf8');

  const auth = new GoogleAuth({
    credentials: account,
    scopes: ['https://www.googleapis.com/auth/firebase'],
  });
  const client = await auth.getClient();
  const base = `https://firebaserules.googleapis.com/v1/projects/${projectId}`;

  console.log(`\n  Project: ${projectId}`);
  console.log(`  Source : ${RULES_PATH} (${source.length} bytes)\n`);

  const ruleset = await client.request({
    url: `${base}/rulesets`,
    method: 'POST',
    data: {
      source: {
        files: [{ name: 'firestore.rules', content: source }],
      },
    },
  });

  const rulesetName = ruleset.data.name;
  console.log(`  created ruleset ${rulesetName}`);

  // The release for Firestore is always named <project>/firestore.
  const releaseName = `projects/${projectId}/releases/cloud.firestore`;

  try {
    await client.request({
      url: `${base}/releases/cloud.firestore`,
      method: 'PATCH',
      data: { release: { name: releaseName, rulesetName } },
    });
    console.log('  updated release cloud.firestore');
  } catch (error) {
    // A project that has never published rules has no release to patch.
    if (error?.response?.status === 404) {
      await client.request({
        url: `${base}/releases`,
        method: 'POST',
        data: { name: releaseName, rulesetName },
      });
      console.log('  created release cloud.firestore');
    } else {
      throw error;
    }
  }

  console.log('\n  Rules are live.\n');
};

run().catch((error) => {
  const message =
    error?.response?.data?.error?.message || error?.message || String(error);
  const status = error?.response?.status;

  if (status === 403) {
    console.error(
      `\n  Permission denied: ${message}\n\n` +
        '  Publish by hand instead: Firebase console, Firestore, Rules tab,\n' +
        '  paste the contents of firestore.rules, then Publish.\n',
    );
  } else {
    console.error(`\n  ${message}\n`);
  }
  process.exit(1);
});
