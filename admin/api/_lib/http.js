// Small HTTP helpers so every function handles methods, bodies and errors
// the same way.

export function send(res, status, body) {
  res.status(status).json(body);
}

export function ok(res, body = { ok: true }) {
  send(res, 200, body);
}

export function fail(res, status, message, extra = {}) {
  send(res, status, { error: message, ...extra });
}

/**
 * Guards the HTTP method. Returns true when the request should stop here.
 */
export function methodNotAllowed(req, res, allowed) {
  if (allowed.includes(req.method)) return false;
  res.setHeader('Allow', allowed.join(', '));
  fail(res, 405, `Method ${req.method} not allowed.`);
  return true;
}

/**
 * Vercel parses JSON bodies automatically, but not when the content-type is
 * missing or the body arrives as a raw string. Normalise both cases.
 */
export function readJson(req) {
  const { body } = req;
  if (!body) return {};
  if (typeof body === 'string') {
    try {
      return JSON.parse(body);
    } catch {
      return {};
    }
  }
  return body;
}

/**
 * Wraps a handler so an unexpected throw becomes a 500 instead of a hung
 * request, and so the real reason lands in the Vercel logs.
 */
export function withErrorHandling(handler) {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (error) {
      console.error(`[${req.method} ${req.url}]`, error);
      if (res.headersSent) return;
      fail(res, 500, error?.message || 'Unexpected server error.');
    }
  };
}
