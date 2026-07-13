/**
 * Semantic version utilities for the app version / update policy machinery.
 *
 * Scope: plain `MAJOR.MINOR.PATCH` versions — exactly what ships in the app
 * stores and in `expo.version`. Prerelease/build-metadata suffixes are
 * deliberately NOT supported: store binaries never carry them, and rejecting
 * them keeps comparison semantics trivial and bug-free.
 */

export interface Semver {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
}

const SEMVER_RE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

/** Parses `"1.2.3"`; returns `null` for anything else (never throws). */
export function parseSemver(value: string): Semver | null {
  const match = SEMVER_RE.exec(value.trim());
  if (!match) return null;
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
}

export function isValidSemver(value: string): boolean {
  return parseSemver(value) !== null;
}

/**
 * Standard comparator: negative if `a < b`, `0` if equal, positive if `a > b`.
 * Throws on malformed input — validate at the boundary first.
 */
export function compareSemver(a: string, b: string): number {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  if (!pa || !pb) {
    throw new TypeError(`Not a valid semver: ${JSON.stringify(!pa ? a : b)}`);
  }
  return pa.major - pb.major || pa.minor - pb.minor || pa.patch - pb.patch;
}

/** `a < b` */
export function semverLt(a: string, b: string): boolean {
  return compareSemver(a, b) < 0;
}

/** `a >= b` */
export function semverGte(a: string, b: string): boolean {
  return compareSemver(a, b) >= 0;
}
