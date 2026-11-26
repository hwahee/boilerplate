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
 *      Rules: the title always exists (never empty) — it is the service's
 *      name for screen readers and the home link even when hidden. The
 *      tagline is optional (empty string = none) and is shown only while the
 *      title is visible.
 *   2. Logo (optional, header and footer): set `LOGO` below. To show the logo
 *      alone, also set `TITLE_VISIBLE = false` (needs a `LOGO`).
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
 * decorative (the title always names the service, visible or not), so it gets
 * empty alt text unless `alt` is given. Use `srcDark` for a variant that
 * reads on the dark theme when the default one does not.
 */
export interface Logo {
  src: string;
  /** Variant for the dark theme; falls back to `src`. */
  srcDark?: string;
  alt?: string;
}

export const LOGO: Logo | null = null;

/**
 * Whether the title text is shown. `false` hides it visually only (it stays
 * for screen readers) and hides the tagline too; requires a `LOGO`.
 */
export const TITLE_VISIBLE = true;

export interface ResolvedBrand {
  logo: Logo | null;
  /** Always non-empty. */
  title: string;
  titleVisible: boolean;
  /** Empty when there is none or the title is hidden. */
  tagline: string;
}

/** The title/tagline/logo header and footer actually show (rules above). */
export function resolveBrand(
  title: string,
  tagline: string,
  logo: Logo | null,
  titleVisible: boolean = TITLE_VISIBLE,
): ResolvedBrand {
  return { logo, title, titleVisible, tagline: titleVisible ? tagline.trim() : '' };
}

/** Why a title/logo combination breaks the rules, or null when it is valid. */
export function brandProblem(
  title: string,
  logo: Logo | null,
  titleVisible: boolean = TITLE_VISIBLE,
): string | null {
  if (!title.trim()) return 'The title is required, even when hidden.';
  if (!titleVisible && !logo) return 'A hidden title needs a LOGO to identify the service.';
  return null;
}
