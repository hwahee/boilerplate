/**
 * The service logo from `../brand.ts`, shown before the title in the header
 * and footer. Renders nothing when no logo is configured.
 */
import { LOGO } from '../brand';

export function BrandLogo() {
  if (!LOGO) return null;
  const { src, srcDark, alt = '' } = LOGO;
  // The dark variant is swapped by CSS on the root's data-theme, so the
  // choice follows the theme switch without any React state.
  return (
    <>
      <img
        className={srcDark ? 'brand-logo brand-logo--light' : 'brand-logo'}
        src={src}
        alt={alt}
      />
      {srcDark && <img className="brand-logo brand-logo--dark" src={srcDark} alt={alt} />}
    </>
  );
}

/** Class of the `.brand` row; `collapsed` leaves the logo alone (see use-brand-collapse). */
export function brandClass(hasLogo: boolean, collapsed: boolean): string {
  return ['brand', hasLogo && 'brand--logo', collapsed && 'brand--collapsed']
    .filter(Boolean)
    .join(' ');
}
