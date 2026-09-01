// Catalogues a folder of books unattended.
//
//   node --env-file=.env.local scripts/bulk-import.js --dir "D:\books" --csv "D:\books.csv"
//
// Cataloguing through the web form costs roughly a minute per book, which is
// about six working weeks for ten thousand titles. This does the same work at
// machine speed, leaving the human effort at preparing the spreadsheet, which
// several people can share.
//
// The CSV needs a header row and three columns:
//
//   file,title,extract
//   physics-101.pdf,Introduction to Physics,"A first course covering mechanics."
//
// Flags:
//   --dir <path>     folder holding the book files          (required)
//   --csv <path>     metadata spreadsheet                   (required)
//   --dry-run        validate everything, upload nothing
//   --concurrency N  simultaneous uploads, default 3
//   --limit N        stop after N books, for a trial run
//
// Safe to re-run: a title already in the catalogue is skipped rather than
// duplicated, so an interrupted run can simply be started again.

import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { basename, extname, join, resolve } from 'node:path';
import { db } from '../api/_lib/firebaseAdmin.js';
import { driveClient, downloadUrl, requiredEnv } from '../api/_lib/drive.js';
import { normalise } from '../api/_lib/search.js';

const EXTENSION_TO_MIME = {
  '.pdf': 'application/pdf',
  '.epub': 'application/epub+zip',
  '.mobi': 'application/x-mobipocket-ebook',
  '.azw3': 'application/vnd.amazon.ebook',
  '.txt': 'text/plain',
  '.doc': 'application/msword',
  '.docx':
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

const MAX_TITLE = 200;
const MAX_EXTRACT = 5000;

// ---------- argument parsing ----------

function parseArgs(argv) {
  const args = { concurrency: 3 };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === '--dry-run') args.dryRun = true;
    else if (flag === '--dir') args.dir = argv[++i];
    else if (flag === '--csv') args.csv = argv[++i];
    else if (flag === '--concurrency') args.concurrency = Number(argv[++i]) || 3;
    else if (flag === '--limit') args.limit = Number(argv[++i]) || undefined;
  }
  return args;
}

function bail(message) {
  console.error(`\n  ${message}\n`);
  process.exit(1);
}

// ---------- CSV ----------

/**
 * Minimal RFC 4180 reader: handles quoted fields, embedded commas, embedded
 * newlines and doubled quotes. Extracts routinely contain commas, so splitting
 * on commas alone would silently corrupt the data.
 */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') quoted = true;
    else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (char !== '\r') {
      field += char;
    }
  }

  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}

function readMetadata(csvPath) {
  const rows = parseCsv(readFileSync(csvPath, 'utf8'));
  if (!rows.length) bail('The CSV is empty.');

  const header = rows[0].map((h) => normalise(h));
  const fileIdx = header.indexOf('file');
  const titleIdx = header.indexOf('title');
  const extractIdx = header.indexOf('extract');

  if (fileIdx === -1 || titleIdx === -1) {
    bail(
      'The CSV needs a header row containing at least "file" and "title".\n' +
        `    Found: ${header.join(', ') || '(nothing)'}`,
    );
  }

  return rows.slice(1).map((row, index) => ({
    line: index + 2,
    file: (row[fileIdx] || '').trim(),
    title: (row[titleIdx] || '').trim(),
    extract: extractIdx === -1 ? '' : (row[extractIdx] || '').trim(),
  }));
}

// ---------- validation ----------

function validate(entries, dir) {
  const problems = [];
  const ok = [];
  const seenFiles = new Set();

  for (const entry of entries) {
    const where = `line ${entry.line}`;

    if (!entry.file) {
      problems.push(`${where}: no file name`);
      continue;
    }
    if (!entry.title) {
      problems.push(`${where}: no title for "${entry.file}"`);
      continue;
    }
    if (entry.title.length > MAX_TITLE) {
      problems.push(`${where}: title exceeds ${MAX_TITLE} characters`);
      continue;
    }
    if (entry.extract.length > MAX_EXTRACT) {
      problems.push(`${where}: extract exceeds ${MAX_EXTRACT} characters`);
      continue;
    }

    const path = resolve(join(dir, entry.file));
    if (!existsSync(path)) {
      problems.push(`${where}: file not found — ${entry.file}`);
      continue;
    }

    const ext = extname(entry.file).toLowerCase();
    const mimeType = EXTENSION_TO_MIME[ext];
    if (!mimeType) {
      problems.push(`${where}: unsupported format "${ext || 'none'}"`);
      continue;
    }

    if (seenFiles.has(path)) {
      problems.push(`${where}: "${entry.file}" appears more than once`);
      continue;
    }
    seenFiles.add(path);

    ok.push({ ...entry, path, mimeType, size: statSync(path).size });
  }

  return { ok, problems };
}

// ---------- import ----------

async function existingTitles() {
  const snapshot = await db().collection('books').select('titleLower').get();
  return new Set(snapshot.docs.map((d) => d.data().titleLower).filter(Boolean));
}

async function importOne(entry, folderId) {
  const drive = driveClient();

  // Running server side there is no 4.5 MB request limit to work around, so
  // the file streams straight up rather than through a resumable session.
  const { data: file } = await drive.files.create({
    requestBody: {
      name: basename(entry.file),
      parents: [folderId],
      mimeType: entry.mimeType,
    },
    media: { mimeType: entry.mimeType, body: createReadStream(entry.path) },
    fields: 'id, name, size, mimeType, webViewLink',
    supportsAllDrives: true,
  });

  try {
    await drive.permissions.create({
      fileId: file.id,
      requestBody: { role: 'reader', type: 'anyone' },
      supportsAllDrives: true,
    });

    await db().collection('books').add({
      title: entry.title,
      titleLower: normalise(entry.title),
      extract: entry.extract,
      fileId: file.id,
      fileName: file.name,
      mimeType: file.mimeType || entry.mimeType,
      fileSize: Number(file.size) || entry.size,
      downloadUrl: downloadUrl(file.id),
      webViewLink: file.webViewLink || null,
      createdAt: new Date(),
      createdBy: 'bulk-import',
    });
  } catch (error) {
    // Never leave a file in Drive that no catalogue entry points at.
    await drive.files
      .delete({ fileId: file.id, supportsAllDrives: true })
      .catch(() => {});
    throw error;
  }
}

/** Runs tasks with a fixed number in flight. */
async function runPool(items, size, worker) {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      await worker(items[index], index);
    }
  });
  await Promise.all(runners);
}

// ---------- main ----------

const args = parseArgs(process.argv.slice(2));

if (!args.dir || !args.csv) {
  bail(
    'Usage:\n' +
      '    node --env-file=.env.local scripts/bulk-import.js --dir <folder> --csv <file>\n\n' +
      '  Optional: --dry-run  --concurrency N  --limit N',
  );
}
if (!existsSync(args.dir)) bail(`Folder not found: ${args.dir}`);
if (!existsSync(args.csv)) bail(`CSV not found: ${args.csv}`);

const run = async () => {
  const folderId = requiredEnv('GOOGLE_DRIVE_FOLDER_ID');

  console.log('\n  Reading metadata…');
  const entries = readMetadata(args.csv);
  const { ok, problems } = validate(entries, args.dir);

  console.log(`  ${entries.length} rows, ${ok.length} valid, ${problems.length} rejected`);

  if (problems.length) {
    console.log('\n  Rejected rows:');
    for (const p of problems.slice(0, 25)) console.log(`    ${p}`);
    if (problems.length > 25) {
      console.log(`    …and ${problems.length - 25} more`);
    }
  }

  if (!ok.length) bail('Nothing valid to import.');

  console.log('\n  Checking for titles already catalogued…');
  const already = await existingTitles();
  let queue = ok.filter((entry) => !already.has(normalise(entry.title)));
  const skipped = ok.length - queue.length;
  if (skipped) console.log(`  ${skipped} already in the catalogue, skipping those`);

  if (args.limit) queue = queue.slice(0, args.limit);

  const totalBytes = queue.reduce((sum, e) => sum + e.size, 0);
  console.log(
    `\n  Ready to import ${queue.length} books ` +
      `(${(totalBytes / 1024 / 1024).toFixed(0)} MB)`,
  );

  if (args.dryRun) {
    console.log('\n  Dry run: nothing was uploaded.\n');
    for (const entry of queue.slice(0, 10)) {
      console.log(`    ${entry.title}  <-  ${entry.file}`);
    }
    if (queue.length > 10) console.log(`    …and ${queue.length - 10} more`);
    console.log('');
    return;
  }

  if (!queue.length) {
    console.log('\n  Nothing to do.\n');
    return;
  }

  console.log('');
  let done = 0;
  const failures = [];

  await runPool(queue, args.concurrency, async (entry) => {
    try {
      await importOne(entry, folderId);
      done += 1;
      console.log(`  [${done}/${queue.length}] ${entry.title}`);
    } catch (error) {
      failures.push({ entry, message: error?.message || String(error) });
      console.log(`  [failed] ${entry.title} — ${error?.message || error}`);
    }
  });

  console.log(`\n  Imported ${done} of ${queue.length}`);

  if (failures.length) {
    console.log(`  ${failures.length} failed:\n`);
    for (const f of failures) console.log(`    ${f.entry.file}: ${f.message}`);
    console.log('\n  Re-run the same command to retry only the failures.\n');
    process.exitCode = 1;
  } else {
    console.log('  No failures.\n');
  }
};

run().catch((error) => bail(error?.message || String(error)));
