/**
 * Design tokens — the single source of every color/space/type value in the
 * app. Components consume tokens via `useTheme()`; no component hardcodes a
 * color or font size.
 *
 * Two orthogonal axes, both switchable at runtime in Settings:
 *   - color scheme: light / dark (follows the device by default)
 *   - design variant:
 *       A — "aesthetic": soft neutrals, indigo accent, generous radii
 *       B — "high visibility": bigger type, heavier weights, high-contrast
 *           colors, thicker borders, larger touch targets
 */

export type ColorSchemeName = 'light' | 'dark';
export type DesignVariant = 'a' | 'b';

/** @public part of the Tokens contract */
export interface ColorTokens {
  bg: string;
  surface: string;
  surfaceAlt: string;
  text: string;
  textMuted: string;
  primary: string;
  onPrimary: string;
  border: string;
  danger: string;
  onDanger: string;
  success: string;
  warning: string;
  /** Scrim behind modals/boot overlays. */
  overlay: string;
}

/** @public part of the Tokens contract */
export interface TypeScale {
  title: number;
  heading: number;
  body: number;
  caption: number;
  /** Weight used for emphasized text ('600' | '700' …). */
  emphasis: '600' | '700';
}

export interface Tokens {
  colors: ColorTokens;
  spacing: { xs: number; sm: number; md: number; lg: number; xl: number };
  radius: { sm: number; md: number; lg: number; full: number };
  type: TypeScale;
  /** Minimum interactive size (pt) — B is larger for motor accessibility. */
  minTouchTarget: number;
  borderWidth: number;
}

const DESIGN_A_COLORS: Record<ColorSchemeName, ColorTokens> = {
  light: {
    bg: '#F7F7FB',
    surface: '#FFFFFF',
    surfaceAlt: '#EFEFF7',
    text: '#1B1B29',
    textMuted: '#6E6E85',
    primary: '#4F46E5',
    onPrimary: '#FFFFFF',
    border: '#E2E2EE',
    danger: '#DC2626',
    onDanger: '#FFFFFF',
    success: '#16A34A',
    warning: '#D97706',
    overlay: 'rgba(20, 20, 35, 0.55)',
  },
  dark: {
    bg: '#12121A',
    surface: '#1C1C28',
    surfaceAlt: '#262636',
    text: '#ECECF4',
    textMuted: '#9C9CB2',
    primary: '#818CF8',
    onPrimary: '#12121A',
    border: '#323244',
    danger: '#F87171',
    onDanger: '#12121A',
    success: '#4ADE80',
    warning: '#FBBF24',
    overlay: 'rgba(0, 0, 0, 0.65)',
  },
};

const DESIGN_B_COLORS: Record<ColorSchemeName, ColorTokens> = {
  light: {
    bg: '#FFFFFF',
    surface: '#FFFFFF',
    surfaceAlt: '#F2F2F2',
    text: '#000000',
    textMuted: '#3A3A3A',
    primary: '#1D4ED8',
    onPrimary: '#FFFFFF',
    border: '#000000',
    danger: '#B91C1C',
    onDanger: '#FFFFFF',
    success: '#15803D',
    warning: '#B45309',
    overlay: 'rgba(0, 0, 0, 0.7)',
  },
  dark: {
    bg: '#000000',
    surface: '#000000',
    surfaceAlt: '#1A1A1A',
    text: '#FFFFFF',
    textMuted: '#D4D4D4',
    primary: '#FFD60A',
    onPrimary: '#000000',
    border: '#FFFFFF',
    danger: '#FF6B6B',
    onDanger: '#000000',
    success: '#4ADE80',
    warning: '#FFB020',
    overlay: 'rgba(0, 0, 0, 0.85)',
  },
};

const SPACING = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } as const;

export function getTokens(variant: DesignVariant, scheme: ColorSchemeName): Tokens {
  if (variant === 'b') {
    return {
      colors: DESIGN_B_COLORS[scheme],
      spacing: SPACING,
      radius: { sm: 4, md: 6, lg: 8, full: 999 },
      type: { title: 30, heading: 24, body: 19, caption: 16, emphasis: '700' },
      minTouchTarget: 56,
      borderWidth: 2,
    };
  }
  return {
    colors: DESIGN_A_COLORS[scheme],
    spacing: SPACING,
    radius: { sm: 8, md: 12, lg: 16, full: 999 },
    type: { title: 26, heading: 20, body: 16, caption: 13, emphasis: '600' },
    minTouchTarget: 44,
    borderWidth: 1,
  };
}
