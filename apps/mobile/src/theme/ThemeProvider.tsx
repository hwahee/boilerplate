/**
 * Theme context: color scheme (system-following + manual override) × design
 * variant (A aesthetic / B high-visibility), both persisted. One hook:
 *
 *   const { tokens } = useTheme();
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';
import { useColorScheme } from 'react-native';

import { KV_KEYS, kvStore } from '../storage/kv-store';
import { getTokens, type ColorSchemeName, type DesignVariant, type Tokens } from './tokens';

export type ThemeMode = 'system' | 'light' | 'dark';

interface ThemeContextValue {
  tokens: Tokens;
  /** Resolved scheme after applying the mode (what is actually rendered). */
  scheme: ColorSchemeName;
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  variant: DesignVariant;
  setVariant: (variant: DesignVariant) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const THEME_MODES: readonly ThemeMode[] = ['system', 'light', 'dark'];

export function ThemeProvider({ children }: PropsWithChildren) {
  const deviceScheme = useColorScheme(); // re-renders on device theme change
  const [mode, setModeState] = useState<ThemeMode>('system');
  const [variant, setVariantState] = useState<DesignVariant>('a');

  useEffect(() => {
    void kvStore.getString(KV_KEYS.themeMode).then((stored) => {
      if (THEME_MODES.includes(stored as ThemeMode)) setModeState(stored as ThemeMode);
    });
    void kvStore.getString(KV_KEYS.designVariant).then((stored) => {
      if (stored === 'a' || stored === 'b') setVariantState(stored);
    });
  }, []);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    void kvStore.setString(KV_KEYS.themeMode, next);
  }, []);

  const setVariant = useCallback((next: DesignVariant) => {
    setVariantState(next);
    void kvStore.setString(KV_KEYS.designVariant, next);
  }, []);

  // Derived, not stored: the rendered scheme follows mode + device setting.
  const scheme: ColorSchemeName = mode === 'system' ? (deviceScheme ?? 'light') : mode;

  const value = useMemo<ThemeContextValue>(
    () => ({ tokens: getTokens(variant, scheme), scheme, mode, setMode, variant, setVariant }),
    [scheme, mode, setMode, variant, setVariant],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within <ThemeProvider>');
  return context;
}
