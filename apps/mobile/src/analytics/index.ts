/**
 * Crash reporting + analytics facades.
 *
 * The app calls these interfaces only; today they log to the console. To
 * adopt Sentry / Firebase / Amplitude, implement one adapter object per
 * facade and swap it in `configureMonitoring` — zero call-site changes.
 */

export interface CrashReporter {
  captureError(error: unknown, context?: Record<string, unknown>): void;
  setUser(id: string | null): void;
}

export interface Analytics {
  track(event: string, properties?: Record<string, unknown>): void;
  screen(name: string): void;
}

const consoleCrashReporter: CrashReporter = {
  captureError(error, context) {
    console.error('[crash]', error, context ?? '');
  },
  setUser(id) {
    console.log('[crash] user =', id);
  },
};

const consoleAnalytics: Analytics = {
  track(event, properties) {
    console.log('[analytics] track', event, properties ?? '');
  },
  screen(name) {
    console.log('[analytics] screen', name);
  },
};

let crashReporter: CrashReporter = consoleCrashReporter;
let analytics: Analytics = consoleAnalytics;

/** Swap in real adapters (e.g. Sentry) at app start. @public facade seam */
export function configureMonitoring(impl: {
  crashReporter?: CrashReporter;
  analytics?: Analytics;
}): void {
  if (impl.crashReporter) crashReporter = impl.crashReporter;
  if (impl.analytics) analytics = impl.analytics;
}

export function getCrashReporter(): CrashReporter {
  return crashReporter;
}

export function getAnalytics(): Analytics {
  return analytics;
}
