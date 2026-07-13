/**
 * App version / update policy — THE single source of truth is the server's
 * `version_policies` table (one row per platform), served by
 * `GET /api/version-policy`. The app fetches it on every cold start and on
 * every foreground return, then feeds it to {@link decideUpdate}.
 *
 * Three update paths (docs/release-playbook.md decides which one a change needs):
 *   - `ota`   — JS-only change, delivered via expo-updates within the SAME
 *               native runtimeVersion. One tap: download → restart.
 *   - `store` — native change; the button deep-links to the App Store /
 *               Play Store (`storeUrl`).
 *   - force   — not a mode but a threshold: any app below
 *               `minSupportedVersion` is blocked by a full-screen gate.
 *               Raising this value is the ONLY sanctioned way to drop
 *               backward compatibility on the API.
 */
import { isValidSemver, parseSemver, semverLt } from '../semver';
import type { UtcIsoString } from '../time';
import { s, toValidator, type Infer } from '../validation';
import { PLATFORMS } from './platform';

export const UPDATE_MODES = ['ota', 'store'] as const;
export type UpdateMode = (typeof UPDATE_MODES)[number];

const semverString = s
  .string()
  .check(s.refine(isValidSemver, { message: 'Must be MAJOR.MINOR.PATCH' }));

const policyShape = {
  platform: s.enum(PLATFORMS),
  /** Versions below this are hard-blocked (force update). */
  minSupportedVersion: semverString,
  /** Newest available version; anything older gets an optional prompt. */
  latestVersion: semverString,
  /** How `latestVersion` is delivered — see the module doc. */
  updateMode: s.enum(UPDATE_MODES),
  /** App Store / Play Store page for this app. */
  storeUrl: s.string().check(s.minLength(1)),
  /** Optional operator note shown in the update UI (already plain text). */
  message: s.nullable(s.string()),
};

/**
 * Validates the `GET /api/version-policy` response — used by the app so a
 * corrupted/unexpected payload downgrades to "no policy" instead of crashing
 * the boot sequence.
 */
export const versionPolicyValidator = toValidator(
  s.object({
    ...policyShape,
    updatedAt: s.string(),
  }),
);
export type VersionPolicy = Omit<Infer<typeof versionPolicyValidator>, 'updatedAt'> & {
  updatedAt: UtcIsoString;
};

/** Body of the admin upsert (`PUT /api/admin/version-policy/:platform`). */
export const upsertVersionPolicyValidator = toValidator(
  s
    .strictObject({
      minSupportedVersion: semverString,
      latestVersion: semverString,
      updateMode: s.enum(UPDATE_MODES),
      storeUrl: s.string().check(s.minLength(1)),
      message: s._default(s.nullable(s.string()), null),
    })
    .check(
      s.refine((policy) => !semverLt(policy.latestVersion, policy.minSupportedVersion), {
        message: 'latestVersion must be >= minSupportedVersion',
      }),
    ),
);
export type UpsertVersionPolicyInput = Infer<typeof upsertVersionPolicyValidator>;

// ─── Update decision (pure, unit-tested — the app's boot sequence runs this) ──

export type UpdateDecision =
  /** Nothing to do (also: prompt suppressed by a recent "later"). */
  | { kind: 'up-to-date' }
  /** Below minSupportedVersion: block the whole app behind the update gate. */
  | { kind: 'force'; storeUrl: string; message: string | null }
  /** An update exists; the user may skip it. `via` picks the UI/action. */
  | {
      kind: 'optional';
      via: UpdateMode;
      latestVersion: string;
      storeUrl: string;
      message: string | null;
    };

/** Persisted when the user taps "later" on an optional update. */
export interface UpdateSkipRecord {
  /** The exact version that was skipped — a NEWER version prompts again. */
  version: string;
  /** Epoch ms of the skip. */
  skippedAtMs: number;
}

/** "Later" silences the same version for this long (re-prompt after). */
export const SKIP_REMIND_AFTER_MS = 3 * 24 * 60 * 60 * 1000; // 3 days

export interface DecideUpdateInput {
  policy: VersionPolicy;
  /** The running binary's version (from the build config, always valid semver). */
  appVersion: string;
  /** Last "later" tap, if any. */
  skip?: UpdateSkipRecord | null;
  nowMs: number;
  skipRemindAfterMs?: number;
}

/**
 * Pure decision function: policy + current version (+ skip history) → what
 * the UI must do. Fails OPEN on an unparsable app version: an optional
 * prompt lost is recoverable, a wrongly-forced block is not — and the
 * server-side 426 gate still backstops truly unsupported versions.
 */
export function decideUpdate(input: DecideUpdateInput): UpdateDecision {
  const { policy, appVersion, skip, nowMs } = input;
  if (parseSemver(appVersion) === null) return { kind: 'up-to-date' };

  if (semverLt(appVersion, policy.minSupportedVersion)) {
    return { kind: 'force', storeUrl: policy.storeUrl, message: policy.message };
  }

  if (semverLt(appVersion, policy.latestVersion)) {
    const remindAfterMs = input.skipRemindAfterMs ?? SKIP_REMIND_AFTER_MS;
    if (skip != null) {
      const suppressed =
        skip.version === policy.latestVersion && nowMs - skip.skippedAtMs < remindAfterMs;
      if (suppressed) return { kind: 'up-to-date' };
    }
    return {
      kind: 'optional',
      via: policy.updateMode,
      latestVersion: policy.latestVersion,
      storeUrl: policy.storeUrl,
      message: policy.message,
    };
  }

  return { kind: 'up-to-date' };
}
