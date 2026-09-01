// Search and pagination helpers.
//
// Firestore has no full text search. What it does have is range queries, so a
// prefix search is built by storing a normalised lowercase copy of each
// searchable field and asking for everything between the query and the query
// plus a very high code point. That matches "begins with" and nothing else,
// which is the honest limit of this approach: searching "algorithms" will not
// find "Introduction to Algorithms".
//
// The alternative, loading every record and filtering on the client, is what
// this replaces. It reads the entire collection on every search, which is the
// cost that makes a large catalogue unaffordable.

// Last code point in the Basic Multilingual Plane private use area. Sorts
// after any character a title realistically contains.
const HIGH_CODE_POINT = '';

export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;

/** Lowercase, trimmed, internal whitespace collapsed. */
export function normalise(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/** Applies a "begins with" filter on a normalised field. */
export function applyPrefix(query, field, term) {
  const prefix = normalise(term);
  if (!prefix) return query;
  return query
    .orderBy(field)
    .startAt(prefix)
    .endAt(prefix + HIGH_CODE_POINT);
}

/** Reads limit and cursor from the query string, clamped to sane bounds. */
export function readPaging(req) {
  const raw = Number(req.query?.limit);
  const limit = Number.isFinite(raw) && raw > 0
    ? Math.min(Math.floor(raw), MAX_PAGE_SIZE)
    : DEFAULT_PAGE_SIZE;

  const cursor = String(req.query?.cursor || '').trim() || null;
  const q = String(req.query?.q || '').trim();

  return { limit, cursor, q };
}

/**
 * Positions a query after the cursor document.
 *
 * Uses the document snapshot rather than raw field values so that Firestore
 * derives every sort key itself. Passing a bare timestamp would break on ties,
 * and bulk imports create many records within the same millisecond.
 */
export async function applyCursor(query, collection, cursor) {
  if (!cursor) return query;
  const snap = await collection.doc(cursor).get();
  if (!snap.exists) return query; // Stale cursor: start from the beginning.
  return query.startAfter(snap);
}

/**
 * Runs a page query, asking for one extra record to detect whether more exist
 * without a second round trip.
 */
export async function fetchPage(query, limit, mapper) {
  const snapshot = await query.limit(limit + 1).get();
  const docs = snapshot.docs.slice(0, limit);
  const hasMore = snapshot.docs.length > limit;

  return {
    items: docs.map(mapper),
    nextCursor: hasMore && docs.length ? docs[docs.length - 1].id : null,
    hasMore,
  };
}
