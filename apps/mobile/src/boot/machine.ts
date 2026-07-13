/**
 * Boot sequence — an EXPLICIT state machine (pure reducer, unit-tested).
 *
 *   native splash → JS boot screen (this machine) → main app
 *
 *   loading ──BOOT_DATA_LOADED──▶ force-update      (below minSupportedVersion)
 *      │                        ▶ maintenance       (kill switch on)
 *      │                        ▶ ad                (boot ad enabled)
 *      │                        ▶ ready             (otherwise)
 *      └──BOOT_DATA_FAILED─────▶ ready              (fail open — see below)
 *
 *   ad ─AD_FAILED/AD_TIMEOUT──▶ ready               (an ad must NEVER block entry)
 *      ─AD_SKIPPED────────────▶ ready               (if skippable + min show elapsed)
 *      ─AD_COMPLETED──────────▶ ready               (if min show elapsed)
 *
 *   maintenance ─RETRY────────▶ loading             (re-fetch config/policy)
 *
 * Boot work performed while in `loading` (side effects live in
 * useBootSequence.ts, NOT here): remote config load, version policy check,
 * session restore.
 *
 * Fail-open policy: if config/policy cannot be fetched (offline cold start),
 * the app enters normally with cached/default config — a lost optional
 * prompt is recoverable, a wrongly blocked app is not. Truly unsupported
 * versions are still stopped by the server's 426 gate on first API call.
 */
import type { AppConfig, BootAdConfig } from '@app/shared/domain/app-config';
import type { UpdateDecision } from '@app/shared/domain/version-policy';

export type BootState =
  /** Fetching remote config + version policy (+ session restore) in parallel. */
  | { phase: 'loading' }
  /** Kill switch: the whole app is blocked behind the maintenance screen. */
  | { phase: 'maintenance'; message: string | null }
  /** Below minSupportedVersion: full-screen block, update button only. */
  | { phase: 'force-update'; storeUrl: string; message: string | null }
  /** Boot ad slot (dummy provider today; see src/ads). */
  | {
      phase: 'ad';
      ad: BootAdConfig;
      status: 'loading' | 'showing';
      minShowElapsed: boolean;
      /** Kept so `ready` can still surface an optional update prompt. */
      pendingUpdate: UpdateDecision | null;
    }
  /** Main app may render; optionalUpdate drives the non-blocking prompt. */
  | { phase: 'ready'; optionalUpdate: Extract<UpdateDecision, { kind: 'optional' }> | null };

export type BootEvent =
  | { type: 'BOOT_DATA_LOADED'; config: AppConfig; decision: UpdateDecision }
  | { type: 'BOOT_DATA_FAILED' }
  | { type: 'AD_READY' }
  | { type: 'AD_FAILED' }
  | { type: 'AD_TIMEOUT' }
  | { type: 'AD_MIN_SHOW_ELAPSED' }
  | { type: 'AD_SKIPPED' }
  | { type: 'AD_COMPLETED' }
  | { type: 'RETRY' };

export const INITIAL_BOOT_STATE: BootState = { phase: 'loading' };

function readyState(decision: UpdateDecision | null): BootState {
  return {
    phase: 'ready',
    optionalUpdate: decision?.kind === 'optional' ? decision : null,
  };
}

export function bootReducer(state: BootState, event: BootEvent): BootState {
  switch (state.phase) {
    case 'loading':
      switch (event.type) {
        case 'BOOT_DATA_LOADED': {
          const { config, decision } = event;
          // Priority: force update > maintenance > ad > ready. A user who
          // must update cannot do anything else anyway; maintenance beats
          // ads because showing an ad before a dead end is hostile.
          if (decision.kind === 'force') {
            return {
              phase: 'force-update',
              storeUrl: decision.storeUrl,
              message: decision.message,
            };
          }
          if (config.maintenance.enabled) {
            return { phase: 'maintenance', message: config.maintenance.message };
          }
          if (config.bootAd.enabled) {
            return {
              phase: 'ad',
              ad: config.bootAd,
              status: 'loading',
              minShowElapsed: false,
              pendingUpdate: decision,
            };
          }
          return readyState(decision);
        }
        case 'BOOT_DATA_FAILED':
          return readyState(null); // fail open (see module doc)
        default:
          return state;
      }

    case 'ad':
      switch (event.type) {
        case 'AD_READY':
          return state.status === 'loading' ? { ...state, status: 'showing' } : state;
        // Load failure or slow ad: never block app entry.
        case 'AD_FAILED':
        case 'AD_TIMEOUT':
          return readyState(state.pendingUpdate);
        case 'AD_MIN_SHOW_ELAPSED':
          return { ...state, minShowElapsed: true };
        case 'AD_SKIPPED':
          return state.status === 'showing' && state.ad.skippable && state.minShowElapsed
            ? readyState(state.pendingUpdate)
            : state;
        case 'AD_COMPLETED':
          return state.status === 'showing' && state.minShowElapsed
            ? readyState(state.pendingUpdate)
            : state;
        default:
          return state;
      }

    case 'maintenance':
      return event.type === 'RETRY' ? INITIAL_BOOT_STATE : state;

    // Terminal states: force-update ends only via the store; ready never
    // regresses (runtime maintenance switches are handled by useConfig at
    // the App level, not by re-running boot).
    case 'force-update':
    case 'ready':
      return state;
  }
}
