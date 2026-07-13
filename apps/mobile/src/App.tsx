/**
 * App root — provider stack + the gate logic around the main navigator.
 *
 * Provider order (each layer depends on the ones above):
 *   SafeArea → Theme → Locale → Api (needs locale) → Config (needs api)
 *   → PersistQueryClient (offline cache) → AppShell
 *
 * AppShell decides what the user sees, in strict priority order:
 *   1. forced update (server 426 or version policy)      — ForceUpdateScreen
 *   2. boot sequence (loading / ad)                      — BootScreen
 *   3. maintenance kill switch (boot-time AND runtime)   — MaintenanceScreen
 *   4. the app itself (+ optional-update prompt overlay) — RootNavigator
 */
import { useCallback, useMemo, useState } from 'react';
import { DefaultTheme, NavigationContainer, type Theme } from '@react-navigation/native';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { UpgradeRequiredDetails } from '@app/shared/api/errors';

import { ApiProvider, useApi } from './api/ApiProvider';
import { ConfigProvider, useConfig } from './config/ConfigProvider';
import { BootScreen } from './boot/BootScreen';
import { useBootSequence } from './boot/useBootSequence';
import { useAppForeground } from './lifecycle/useAppForeground';
import { LocaleProvider } from './i18n/LocaleProvider';
import { linking } from './navigation/linking';
import { RootNavigator } from './navigation/RootNavigator';
import { createAppQueryClient, PERSIST_MAX_AGE_MS, queryPersister } from './offline/persist';
import { MaintenanceScreen } from './screens/MaintenanceScreen';
import { ThemeProvider, useTheme } from './theme/ThemeProvider';
import { evaluateUpdatePolicy } from './version/policy';
import { ForceUpdateScreen, OptionalUpdatePrompt } from './version/UpdateGate';

// Keep the native splash up until the JS boot screen is mounted.
void SplashScreen.preventAutoHideAsync().catch(() => undefined);

interface ForcedUpdate {
  storeUrl: string;
  message: string | null;
}

function AppShell({ forced426 }: { forced426: ForcedUpdate | null }) {
  const api = useApi();
  const { tokens, scheme } = useTheme();
  const { config, revision, source, refresh, notifyForeground } = useConfig();
  const configState = useMemo(() => ({ config, revision, source }), [config, revision, source]);

  const boot = useBootSequence({ api, configState, refreshConfig: refresh });
  const [forcedByPolicy, setForcedByPolicy] = useState<ForcedUpdate | null>(null);
  const [promptDismissed, setPromptDismissed] = useState(false);

  // Foreground return = mobile "page reload": re-check the version policy,
  // refresh remote config (+ reconnect its socket). Stale queries refetch on
  // their own (TanStack refetches active stale queries on app focus events).
  useAppForeground(() => {
    notifyForeground();
    void evaluateUpdatePolicy(api).then((decision) => {
      if (decision.kind === 'force') {
        setForcedByPolicy({ storeUrl: decision.storeUrl, message: decision.message });
      }
    });
  });

  // React Navigation theme derived from the design tokens.
  const navTheme: Theme = useMemo(
    () => ({
      ...DefaultTheme,
      dark: scheme === 'dark',
      colors: {
        ...DefaultTheme.colors,
        primary: tokens.colors.primary,
        background: tokens.colors.bg,
        card: tokens.colors.surface,
        text: tokens.colors.text,
        border: tokens.colors.border,
        notification: tokens.colors.danger,
      },
    }),
    [scheme, tokens],
  );

  // ── 1. Forced update beats everything ─────────────────────────────────────
  const forced = forced426 ?? forcedByPolicy;
  if (forced) {
    return <ForceUpdateScreen storeUrl={forced.storeUrl} message={forced.message} />;
  }
  if (boot.state.phase === 'force-update') {
    return <ForceUpdateScreen storeUrl={boot.state.storeUrl} message={boot.state.message} />;
  }

  // ── 2. Boot sequence ───────────────────────────────────────────────────────
  if (boot.state.phase === 'loading' || boot.state.phase === 'ad') {
    return <BootScreen state={boot.state} dispatch={boot.dispatch} />;
  }
  if (boot.state.phase === 'maintenance') {
    return <MaintenanceScreen message={boot.state.message} onRetry={boot.retry} />;
  }

  // ── 3. Runtime kill switch (config flipped while the app is open) ─────────
  if (config.maintenance.enabled) {
    return (
      <MaintenanceScreen message={config.maintenance.message} onRetry={() => void refresh()} />
    );
  }

  // ── 4. The app ─────────────────────────────────────────────────────────────
  return (
    <>
      <NavigationContainer theme={navTheme} linking={linking}>
        <RootNavigator />
      </NavigationContainer>
      {boot.state.optionalUpdate && !promptDismissed ? (
        <OptionalUpdatePrompt
          decision={boot.state.optionalUpdate}
          onDismiss={() => setPromptDismissed(true)}
        />
      ) : null}
    </>
  );
}

function ThemedStatusBar() {
  const { scheme } = useTheme();
  return <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />;
}

export function App() {
  const [queryClient] = useState(createAppQueryClient);
  const [forced426, setForced426] = useState<ForcedUpdate | null>(null);

  const onUpgradeRequired = useCallback((details: UpgradeRequiredDetails | undefined) => {
    // Without details (unexpected), fall back to a policy re-check on next
    // foreground; with them we can render the gate immediately.
    if (details?.storeUrl) setForced426({ storeUrl: details.storeUrl, message: null });
  }, []);

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <LocaleProvider>
          <ThemedStatusBar />
          <ApiProvider onUpgradeRequired={onUpgradeRequired}>
            <ConfigProvider>
              <PersistQueryClientProvider
                client={queryClient}
                persistOptions={{ persister: queryPersister, maxAge: PERSIST_MAX_AGE_MS }}
              >
                <AppShell forced426={forced426} />
              </PersistQueryClientProvider>
            </ConfigProvider>
          </ApiProvider>
        </LocaleProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
