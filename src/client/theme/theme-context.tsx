/**
 * Theme context — two independent axes, both applied as attributes on <html>
 * and consumed purely by CSS custom properties (src/client/styles/tokens.css):
 *
 *   data-theme:  'light' | 'dark'   — color scheme
 *   data-design: 'a' | 'b'          — design variant:
 *       A = aesthetic-first (refined spacing, softer contrast)
 *       B = visibility-first (larger type, high contrast, bigger targets)
 *
 * Both persist to localStorage. The initial theme derives from the OS
 * preference — computed once, not stored as extra state.
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type Theme = 'light' | 'dark';
export type Design = 'a' | 'b';

interface ThemeContextValue {
  theme: Theme;
  design: Design;
  toggleTheme: () => void;
  toggleDesign: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const THEME_KEY = 'app.theme';
const DESIGN_KEY = 'app.design';

function initialTheme(): Theme {
  const stored = localStorage.getItem(THEME_KEY);
  if (stored === 'light' || stored === 'dark') return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function initialDesign(): Design {
  const stored = localStorage.getItem(DESIGN_KEY);
  return stored === 'b' ? 'b' : 'a';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [design, setDesign] = useState<Design>(initialDesign);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.dataset.design = design;
    localStorage.setItem(DESIGN_KEY, design);
  }, [design]);

  return (
    <ThemeContext.Provider
      value={{
        theme,
        design,
        toggleTheme: () => setTheme((t) => (t === 'light' ? 'dark' : 'light')),
        toggleDesign: () => setDesign((d) => (d === 'a' ? 'b' : 'a')),
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useTheme must be used within <ThemeProvider>');
  return value;
}
