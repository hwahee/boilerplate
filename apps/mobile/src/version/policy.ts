/**
 * Client side of the update policy: fetch the server policy, combine it with
 * the running binary's version and the persisted "later" record, and hand
 * the boot machine a pure `UpdateDecision`.
 *
 * The decision logic itself lives in @app/shared/domain/version-policy
 * (`decideUpdate`) so server tests and app tests exercise the same code.
 */
import {
  decideUpdate,
  type UpdateDecision,
  type UpdateSkipRecord,
} from '@app/shared/domain/version-policy';

import type { Endpoints } from '../api/endpoints';
import { getCrashReporter } from '../analytics';
import { env } from '../config/env';
import { KV_KEYS, kvStore } from '../storage/kv-store';

/** @public counterpart of saveSkipRecord (part of the policy API) */
export async function loadSkipRecord(): Promise<UpdateSkipRecord | null> {
  return kvStore.getJson<UpdateSkipRecord>(KV_KEYS.updateSkip);
}

/** Persisted when the user taps "later" — suppresses the SAME version for a while. */
export async function saveSkipRecord(version: string): Promise<void> {
  const record: UpdateSkipRecord = { version, skippedAtMs: Date.now() };
  await kvStore.setJson(KV_KEYS.updateSkip, record);
}

/**
 * Boot/foreground check. Fails OPEN (`up-to-date`) when the policy cannot be
 * fetched or parsed: a lost prompt is recoverable, a wrong block is not, and
 * the server's 426 gate still stops truly unsupported versions.
 */
export async function evaluateUpdatePolicy(api: Endpoints): Promise<UpdateDecision> {
  try {
    const [policy, skip] = await Promise.all([
      api.getVersionPolicy(env.platform),
      loadSkipRecord(),
    ]);
    return decideUpdate({ policy, appVersion: env.appVersion, skip, nowMs: Date.now() });
  } catch (error) {
    getCrashReporter().captureError(error, { where: 'evaluateUpdatePolicy' });
    return { kind: 'up-to-date' };
  }
}
