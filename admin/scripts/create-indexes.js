// Creates the composite Firestore indexes the paged queries need.
//
//   node --env-file=.env.local scripts/create-indexes.js
//
// Adding orderBy to a filtered query makes Firestore require a composite
// index. Without these, the students list and search fail with
// FAILED_PRECONDITION.
//
// This talks to the Firestore Admin REST API directly using the service
// account, because `firebase deploy --only firestore:indexes` first tries to
// verify the Firestore API is enabled, and the Firebase Admin SDK service
// account is not granted serviceusage permission to answer that.
//
// Safe to re-run: an index that already exists is reported and skipped.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { GoogleAuth } from 'google-auth-library';

const INDEXES = [
  {
    collectionGroup: 'users',
    reason: 'students list, newest first',
    fields: [
      { fieldPath: 'role', order: 'ASCENDING' },
      { fieldPath: 'createdAt', order: 'DESCENDING' },
    ],
  },
  {
    collectionGroup: 'users',
    reason: 'student search by name',
    fields: [
      { fieldPath: 'role', order: 'ASCENDING' },
      { fieldPath: 'nameLower', order: 'ASCENDING' },
    ],
  },
  {
    collectionGroup: 'users',
    reason: 'student search by roll number',
    fields: [
      { fieldPath: 'role', order: 'ASCENDING' },
      { fieldPath: 'loginIdLower', order: 'ASCENDING' },
    ],
  },
];

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

  const auth = new GoogleAuth({
    credentials: account,
    scopes: ['https://www.googleapis.com/auth/datastore'],
  });
  const client = await auth.getClient();

  console.log(`\n  Project: ${projectId}\n`);

  for (const index of INDEXES) {
    const url =
      `https://firestore.googleapis.com/v1/projects/${projectId}` +
      `/databases/(default)/collectionGroups/${index.collectionGroup}/indexes`;

    const label = `${index.collectionGroup}: ${index.fields
      .map((f) => `${f.fieldPath} ${f.order === 'DESCENDING' ? 'desc' : 'asc'}`)
      .join(', ')}`;

    try {
      await client.request({
        url,
        method: 'POST',
        data: {
          queryScope: 'COLLECTION',
          fields: index.fields,
        },
      });
      console.log(`  created   ${label}`);
      console.log(`            (${index.reason})`);
    } catch (error) {
      const status = error?.response?.status;
      const message =
        error?.response?.data?.error?.message || error?.message || String(error);

      if (status === 409 || /already exists/i.test(message)) {
        console.log(`  exists    ${label}`);
      } else if (status === 403) {
        console.log(`  DENIED    ${label}`);
        console.log(`            ${message}`);
        console.log(
          '            Grant the service account the Cloud Datastore Index Admin\n' +
            '            role, or create the index from the link in the API error.',
        );
      } else {
        console.log(`  FAILED    ${label}`);
        console.log(`            ${message}`);
      }
    }
  }

  console.log(
    '\n  Indexes build in the background and take a few minutes on an empty\n' +
      '  collection. Progress is visible in the Firebase console under\n' +
      '  Firestore, Indexes.\n',
  );
};

run().catch((error) => {
  console.error(`\n  ${error?.message || error}\n`);
  process.exit(1);
});
