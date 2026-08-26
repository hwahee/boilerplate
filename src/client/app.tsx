/**
 * App shell: providers (query cache, theme, locale), router, and the layout
 * with the global controls (theme / design-variant / language switching) plus
 * the shared footer, which routes can opt out of one group at a time.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Moon, Palette, Sun } from 'lucide-react';
import { BrowserRouter, NavLink, Outlet, Route, Routes } from 'react-router';

import { SUPPORTED_LOCALES, type Locale } from '@shared/i18n';

import { LocaleProvider, useI18n } from './i18n/locale-context';
import { DesignSystemPage } from './pages/design-system-page';
import { NotFoundPage } from './pages/not-found-page';
import { TodosPage } from './pages/todos-page';
import { TESTID } from './testing/testids';
import { nextDesign, ThemeProvider, useTheme, type Design } from './theme/theme-context';
import { Button } from './ui/button';
import { Footer } from './ui/footer';
import { Select } from './ui/select';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
});

const LOCALE_LABELS: Record<Locale, string> = { en: 'English', ko: '한국어' };

/** Short label shown on the design toggle button. */
const DESIGN_BADGES: Record<Design, string> = { a: 'A', b: 'B', office: 'Office', kids: 'Kids' };
/** i18n key describing each design, for the toggle's aria-label. */
const DESIGN_LABEL_KEYS = {
  a: 'common.design.a',
  b: 'common.design.b',
  office: 'common.design.office',
  kids: 'common.design.kids',
} as const;

function Header() {
  const { t, locale, setLocale } = useI18n();
  const { theme, design, toggleTheme, toggleDesign } = useTheme();

  return (
    <header className="app-header" data-testid={TESTID.app.header}>
      <div className="app-header__brand">
        <h1 className="app-header__title">{t('app.title')}</h1>
        <p className="app-header__tagline muted">{t('app.tagline')}</p>
      </div>

      <nav className="app-nav" aria-label={t('app.title')}>
        {/* NavLink sets aria-current="page" on the active route automatically. */}
        <NavLink to="/" end data-testid={TESTID.app.navTodos}>
          {t('nav.todos')}
        </NavLink>
        <NavLink to="/design-system" data-testid={TESTID.app.navDesignSystem}>
          {t('nav.designSystem')}
        </NavLink>
      </nav>

      <div className="app-controls">
        <Button
          variant="ghost"
          onClick={toggleTheme}
          aria-label={theme === 'light' ? t('common.theme.dark') : t('common.theme.light')}
          testId={TESTID.app.themeToggle}
        >
          {theme === 'light' ? <Moon aria-hidden size="1em" /> : <Sun aria-hidden size="1em" />}
        </Button>
        <Button
          variant="ghost"
          onClick={toggleDesign}
          aria-label={t(DESIGN_LABEL_KEYS[nextDesign(design)])}
          testId={TESTID.app.designToggle}
        >
          <Palette aria-hidden size="1em" />
          {DESIGN_BADGES[design]}
        </Button>
        <Select<Locale>
          label={t('common.language')}
          hideLabel
          value={locale}
          options={SUPPORTED_LOCALES.map((code) => ({ value: code, label: LOCALE_LABELS[code] }))}
          onChange={setLocale}
          testId={TESTID.app.localeSelect}
        />
      </div>
    </header>
  );
}

/**
 * The chrome wrapped around a routed page.
 *
 * `footer` is the per-route switch for the shared footer. It defaults to
 * `true`, so a new route keeps the footer unless it explicitly opts out —
 * the exception has to be declared, never the rule.
 */
function AppLayout({ footer = true }: { footer?: boolean }) {
  const { t } = useI18n();
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        {t('common.skipToContent')}
      </a>
      <Header />
      <main id="main" className="app-main">
        <Outlet />
      </main>
      {footer && <Footer />}
    </div>
  );
}

/**
 * Route table. Chrome is expressed with layout routes rather than a flag
 * consulted inside the pages, so which routes carry the footer is readable
 * here in one place.
 *
 * Routes are ranked by specificity, not by source order, so the `*` fallback
 * below never shadows a concrete path declared in another group.
 */
function AppRoutes() {
  return (
    <Routes>
      {/* Standard chrome: header + footer. */}
      <Route element={<AppLayout />}>
        <Route path="/" element={<TodosPage />} />
        <Route path="/design-system" element={<DesignSystemPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>

      {/* Pages that own the whole viewport — full-screen editors, embedded
          widgets, kiosk views — go in their own group with the footer off:

      <Route element={<AppLayout footer={false} />}>
        <Route path="/embed/:id" element={<EmbedPage />} />
      </Route> */}
    </Routes>
  );
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <LocaleProvider>
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </LocaleProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
