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
 * decorative — the title text beside it already names the service — so it
 * gets empty alt text unless `alt` is given. Use `srcDark` for a variant that
 * reads on the dark theme when the default one does not.
 */
export interface Logo {
  src: string;
  /** Variant for the dark theme; falls back to `src`. */
  srcDark?: string;
  alt?: string;
}

export const LOGO: Logo | null = null;
