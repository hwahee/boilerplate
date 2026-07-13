/**
 * Supported platforms.
 *
 * Support matrix (see README "지원 기기·플랫폼"): Apple iPhones and Samsung
 * Galaxy phones ONLY. There is deliberately no `web`, no tablet layout tier
 * and no foldable special-casing anywhere in this codebase — adding a
 * platform starts by extending this union.
 */

export const PLATFORMS = ['ios', 'android'] as const;
export type Platform = (typeof PLATFORMS)[number];

export function isPlatform(value: unknown): value is Platform {
  return typeof value === 'string' && (PLATFORMS as readonly string[]).includes(value);
}
