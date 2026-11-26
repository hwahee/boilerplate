/**
 * Brand assets of the service — the one file to edit to rebrand.
 *
 * FOR AI AGENTS working in a repository started from this boilerplate:
 * the header and footer ship with the boilerplate's own name and tagline
 * ("Bun Fullstack Boilerplate"). Changing them to fit what THIS repository's
 * service actually is, is RECOMMENDED — do it as part of the first real work,
 * unless the user says otherwise. Rebranding is these three things:
 *
 *   1. Title and tagline (header and footer): the `app.title` and `app.tagline`
 *      keys in `src/shared/i18n/messages/ko.ts` AND `en.ts`. Also update the
 *      `<title>` in `src/client/index.html` to match.
 *      Rules: the service always has a title OR a logo (an empty title is
 *      allowed only with a `LOGO`, and then `LOGO.alt` is required, since it
 *      is the service's only name). The tagline is optional (empty string =
 *      none) and is never shown without a title.
 *   2. Logo (optional, header and footer): set `LOGO` below.
 *   3. Favicon: replace `src/client/assets/favicon.svg` (see index.html).
 */

/**
 * Logo shown before the title in the header and footer; `null` shows no logo.
 *
 * To use one, put the image in `src/client/assets/` and import it:
 *
 *   import logoUrl from './assets/logo.svg';
 *   export const LOGO: Logo | null = { src: logoUrl };
 *
 * (`.svg`, `.png`, `.webp` imports are typed in `assets.d.ts`.) The image is
 * decorative when the title text is beside it, so it gets empty alt text
 * unless `alt` is given; with an empty title `alt` is REQUIRED. Use `srcDark` for a variant that
 * reads on the dark theme when the default one does not.
 */
export interface Logo {
  src: string;
  /** Variant for the dark theme; falls back to `src`. */
  srcDark?: string;
  alt?: string;
}

export const LOGO: Logo | null = null;

export interface ResolvedBrand {
  logo: Logo | null;
  /** Empty when the service is identified by its logo alone. */
  title: string;
  /** Empty when there is none, and always empty when there is no title. */
  tagline: string;
}

/** The title/tagline/logo header and footer actually show (rules above). */
export function resolveBrand(title: string, tagline: string, logo: Logo | null): ResolvedBrand {
  const t = title.trim();
  return { logo, title: t, tagline: t ? tagline.trim() : '' };
}

/** Why a title/logo combination breaks the rules, or null when it is valid. */
export function brandProblem(title: string, logo: Logo | null): string | null {
  if (title.trim()) return null;
  if (!logo) return 'No title and no logo: the service needs at least one.';
  if (!logo.alt?.trim()) return 'No title: LOGO.alt is required, it is the only name.';
  return null;
}
