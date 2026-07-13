/**
 * Cursor pagination / sorting / filtering — the repo-wide parameter convention.
 *
 * Mobile lists are infinite-scroll by default, so every list endpoint uses
 * CURSOR (keyset) pagination — stable under concurrent inserts/deletes,
 * unlike page/offset. The convention:
 *
 *   GET /api/things?limit=20                — first page
 *      &cursor=<opaque>                     — next page (from `nextCursor`)
 *      &sortBy=<field>&sortOrder=asc|desc   — whitelisted per endpoint
 *      &<filterField>=<value>               — endpoint-specific flat filters
 *
 * responding with the `CursorPage<T>` envelope below. `nextCursor` is `null`
 * on the last page; the value is OPAQUE to clients — they must echo it back
 * verbatim, never parse or construct one. This plugs directly into TanStack
 * Query's `useInfiniteQuery` (`getNextPageParam: (page) => page.nextCursor`).
 *
 * Version-skew rule: the envelope fields and cursor opacity are a wire
 * contract with shipped app binaries — never remove or repurpose them.
 */
import { decodeBase64Url, encodeBase64Url } from './base64url';

export const CURSOR_PAGINATION = {
  defaultLimit: 20,
  maxLimit: 100,
} as const;

export const SORT_ORDERS = ['asc', 'desc'] as const;
export type SortOrder = (typeof SORT_ORDERS)[number];

/** Response envelope for every list endpoint. */
export interface CursorPage<T> {
  items: T[];
  /** Opaque cursor for the next page, or `null` when this is the last page. */
  nextCursor: string | null;
}

/**
 * What a cursor encodes: the sort-key value and the row id of the last item
 * of the previous page (keyset pagination needs both — the id breaks ties).
 * The sort parameters are baked in so a cursor cannot be replayed against a
 * different ordering (which would silently skip or repeat rows).
 */
export interface CursorPayload {
  /** Serialized sort-key value of the last row (e.g. ISO timestamp or title). */
  readonly v: string;
  /** Row id of the last row — the unique tiebreaker. */
  readonly id: string;
  readonly sortBy: string;
  readonly sortOrder: SortOrder;
}

export function encodeCursor(payload: CursorPayload): string {
  return encodeBase64Url(JSON.stringify(payload));
}

/** Returns `null` for malformed/foreign cursors (mapped to 400 at the route layer). */
export function decodeCursor(cursor: string): CursorPayload | null {
  const json = decodeBase64Url(cursor);
  if (json === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const record = parsed as Record<string, unknown>;
  if (
    typeof record.v !== 'string' ||
    typeof record.id !== 'string' ||
    typeof record.sortBy !== 'string' ||
    (record.sortOrder !== 'asc' && record.sortOrder !== 'desc')
  ) {
    return null;
  }
  return { v: record.v, id: record.id, sortBy: record.sortBy, sortOrder: record.sortOrder };
}

/**
 * Builds the `CursorPage<T>` envelope from `limit + 1` fetched rows: the
 * extra row (if present) proves there is a next page and is trimmed off.
 */
export function buildCursorPage<T>(
  rows: T[],
  limit: number,
  makeCursor: (lastItem: T) => CursorPayload,
): CursorPage<T> {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items[items.length - 1];
  return {
    items,
    nextCursor: hasMore && last !== undefined ? encodeCursor(makeCursor(last)) : null,
  };
}

/**
 * Converts `URLSearchParams` into a plain object suitable for validation,
 * coercing the numeric `limit` param. All other values stay strings and are
 * validated by the endpoint's own validator.
 */
export function searchParamsToObject(params: URLSearchParams): Record<string, unknown> {
  const raw: Record<string, unknown> = {};
  for (const [key, value] of params) {
    if (key === 'limit') {
      raw[key] = value === '' ? undefined : Number(value);
    } else {
      raw[key] = value;
    }
  }
  return raw;
}
