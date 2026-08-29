// Local stand-in for Vercel's serverless runtime.
//
//   node --env-file=.env.local dev-server.mjs
//
// Vite proxies /api/* here (see vite.config.js), and this loads the very same
// files under api/ that Vercel will deploy — so what works locally is what
// ships. It exists so local development does not require `vercel dev` and a
// Vercel login just to click through the panel.
//
// Only the slice of the Vercel request/response API our handlers actually use
// is emulated: req.query, req.body, res.status().json(), res.setHeader().

import { createServer } from 'node:http';
import { readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const PORT = Number(process.env.API_PORT) || 3001;
const API_DIR = resolve(process.cwd(), 'api');

/**
 * Maps a URL path to a handler file the way Vercel's filesystem routing does:
 * literal segments win over [dynamic] ones, and a directory falls back to its
 * index.js.
 */
async function resolveRoute(segments) {
  let dir = API_DIR;
  const params = {};

  for (let i = 0; i < segments.length; i += 1) {
    const segment = segments[i];
    const isLast = i === segments.length - 1;

    if (isLast) {
      const literal = join(dir, `${segment}.js`);
      if (existsSync(literal)) return { file: literal, params };

      const asIndex = join(dir, segment, 'index.js');
      if (existsSync(asIndex)) return { file: asIndex, params };

      const dynamic = (await readdir(dir)).find(
        (name) => name.startsWith('[') && name.endsWith('].js'),
      );
      if (dynamic) {
        params[dynamic.slice(1, -4)] = decodeURIComponent(segment);
        return { file: join(dir, dynamic), params };
      }
      return null;
    }

    const literalDir = join(dir, segment);
    if (existsSync(literalDir)) {
      dir = literalDir;
      continue;
    }

    const dynamicDir = (await readdir(dir, { withFileTypes: true })).find(
      (entry) => entry.isDirectory() && entry.name.startsWith('['),
    );
    if (!dynamicDir) return null;

    params[dynamicDir.name.slice(1, -1)] = decodeURIComponent(segment);
    dir = join(dir, dynamicDir.name);
  }

  return null;
}

function readBody(req) {
  return new Promise((resolvePromise, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolvePromise(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/** Adds the Express-style helpers Vercel handlers expect. */
function decorateResponse(res) {
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (payload) => {
    if (!res.headersSent) res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(payload));
    return res;
  };
  return res;
}

const server = createServer(async (req, res) => {
  decorateResponse(res);

  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (!url.pathname.startsWith('/api/')) {
    return res.status(404).json({ error: 'Not an API route.' });
  }

  const segments = url.pathname
    .replace(/^\/api\//, '')
    .split('/')
    .filter(Boolean);

  const route = await resolveRoute(segments);
  if (!route) {
    return res.status(404).json({ error: `No handler for ${url.pathname}` });
  }

  req.query = {
    ...Object.fromEntries(url.searchParams),
    ...route.params,
  };

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    const raw = await readBody(req);
    try {
      req.body = raw ? JSON.parse(raw) : {};
    } catch {
      req.body = raw;
    }
  }

  try {
    // Cache-busting query so edits to a handler are picked up without a
    // restart — Node's module cache would otherwise hold the first version.
    const module = await import(
      `${pathToFileURL(route.file).href}?t=${Date.now()}`
    );
    await module.default(req, res);
  } catch (error) {
    console.error(`[${req.method} ${url.pathname}]`, error);
    if (!res.headersSent) {
      res.status(500).json({ error: error?.message || 'Handler failed.' });
    }
  }
});

server.listen(PORT, () => {
  console.log(`  API dev server → http://localhost:${PORT}/api/*`);
  console.log(`  Serving handlers from ${API_DIR}\n`);
});
