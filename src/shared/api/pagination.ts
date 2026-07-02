/**
 * Pagination / sorting / filtering — the repo-wide parameter convention.
 *
 * Every list endpoint MUST accept:
 *   ?page=1&pageSize=20          — 1-based page, capped at `maxPageSize`
 *   &sortBy=<field>&sortOrder=asc|desc
 *   &<filterField>=<value>       — endpoint-specific flat filter params
 *
 * and MUST respond with the `Page<T>` envelope below. Endpoint-specific
 * validators (see e.g. `@shared/domain/todo`) whitelist their own sortable
 * fields and filter params on top of this base.
 */

export const PAGINATION = {
  defaultPage: 1,
  defaultPageSize: 20,
  maxPageSize: 100,
} as const;

export const SORT_ORDERS = ['asc', 'desc'] as const;

/** Response envelope for every list endpoint. */
export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasNextPage: boolean;
}

/** Builds the `Page<T>` envelope from a page of rows plus the total count. */
export function buildPage<T>(
  items: T[],
  totalItems: number,
  request: { page: number; pageSize: number },
): Page<T> {
  const totalPages = Math.max(1, Math.ceil(totalItems / request.pageSize));
  return {
    items,
    page: request.page,
    pageSize: request.pageSize,
    totalItems,
    totalPages,
    hasNextPage: request.page < totalPages,
  };
}

/**
 * Converts `URLSearchParams` into a plain object suitable for validation,
 * coercing the numeric pagination params. All other values stay strings and
 * are validated by the endpoint's own validator.
 */
export function searchParamsToObject(params: URLSearchParams): Record<string, unknown> {
  const raw: Record<string, unknown> = {};
  for (const [key, value] of params) {
    if (key === 'page' || key === 'pageSize') {
      raw[key] = value === '' ? undefined : Number(value);
    } else {
      raw[key] = value;
    }
  }
  return raw;
}
