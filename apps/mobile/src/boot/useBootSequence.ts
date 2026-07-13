/**
 * Boot orchestration — runs the side effects around the pure boot machine
 * (src/boot/machine.ts): kicks off boot work when `loading`, drives the ad
 * slot timers when `ad`, and exposes `dispatch`/`retry` to the UI.
 *
 * Boot work (parallel): session restore (placeholder — warms the secure
 * store), remote-config refresh, version-policy evaluation. A hard timeout
 * guarantees the app NEVER hangs on the boot screen.
 */
import { useEffect, useReducer, useRef, type Dispatch } from 'react';

import type { Endpoints } from '../api/endpoints';
import { dummyAdProvider } from '../ads/dummy';
import type { AdProvider } from '../ads/types';
import { getAnalytics } from '../analytics';
import { getAuthToken } from '../storage/secure-store';
import { evaluateUpdatePolicy } from '../version/policy';
import type { RemoteConfigState } from '../config/remote-config';
import { bootReducer, INITIAL_BOOT_STATE, type BootEvent, type BootState } from './machine';

/** Give slow networks a chance, but never hold the user hostage. */
const BOOT_WORK_TIMEOUT_MS = 8_000;

interface UseBootSequenceArgs {
  api: Endpoints;
  configState: RemoteConfigState;
  refreshConfig: () => Promise<void>;
  /** Swap for a real ad SDK adapter (or a test double) here. */
  adProvider?: AdProvider;
}

export interface BootSequence {
  state: BootState;
  dispatch: Dispatch<BootEvent>;
  /** From the maintenance screen: re-runs the whole boot work. */
  retry: () => void;
}

export function useBootSequence({
  api,
  configState,
  refreshConfig,
  adProvider = dummyAdProvider,
}: UseBootSequenceArgs): BootSequence {
  const [state, dispatch] = useReducer(bootReducer, INITIAL_BOOT_STATE);

  // The boot-work effect only depends on the phase; it reads the LATEST
  // config through this ref (the config store updates independently).
  const configRef = useRef(configState);
  useEffect(() => {
    configRef.current = configState;
  });

  // ── loading: session restore + config + policy, with a hard timeout ──────
  const runIdRef = useRef(0);
  useEffect(() => {
    if (state.phase !== 'loading') return;
    const runId = ++runIdRef.current;
    let finished = false;

    const timer = setTimeout(() => {
      if (!finished && runIdRef.current === runId) dispatch({ type: 'BOOT_DATA_FAILED' });
    }, BOOT_WORK_TIMEOUT_MS);

    void (async () => {
      const [, , decision] = await Promise.all([
        // Session-restore slot: auth is out of scope, but the boot sequence
        // reserves its place — replace with a real token refresh when needed.
        getAuthToken().catch(() => null),
        refreshConfig().catch(() => undefined), // store falls back to cache/defaults
        evaluateUpdatePolicy(api), // never throws (fails open)
      ]);
      finished = true;
      clearTimeout(timer);
      if (runIdRef.current === runId) {
        dispatch({ type: 'BOOT_DATA_LOADED', config: configRef.current.config, decision });
      }
    })();

    return () => {
      clearTimeout(timer);
    };
  }, [state.phase, api, refreshConfig]);

  // ── ad: slot lifecycle + the timing rules from remote config ─────────────
  const adPhase = state.phase === 'ad';
  const adStatus = adPhase ? state.status : null;
  const adConfig = adPhase ? state.ad : null;

  useEffect(() => {
    if (!adPhase) return;
    getAnalytics().track('boot_ad_slot_started');
    const slot = adProvider.createBootAdSlot();
    slot.start({
      onReady: () => dispatch({ type: 'AD_READY' }),
      onFailed: () => dispatch({ type: 'AD_FAILED' }),
      onCompleted: () => dispatch({ type: 'AD_COMPLETED' }),
    });
    return () => slot.dispose();
  }, [adPhase, adProvider]);

  // Load timeout: a slow ad must not gate app entry.
  useEffect(() => {
    if (!adPhase || adStatus !== 'loading' || !adConfig) return;
    const timer = setTimeout(() => dispatch({ type: 'AD_TIMEOUT' }), adConfig.timeoutMs);
    return () => clearTimeout(timer);
  }, [adPhase, adStatus, adConfig]);

  // Minimum show time starts once the creative is actually visible.
  useEffect(() => {
    if (!adPhase || adStatus !== 'showing' || !adConfig) return;
    const timer = setTimeout(() => dispatch({ type: 'AD_MIN_SHOW_ELAPSED' }), adConfig.minShowMs);
    return () => clearTimeout(timer);
  }, [adPhase, adStatus, adConfig]);

  return {
    state,
    dispatch,
    retry: () => dispatch({ type: 'RETRY' }),
  };
}
