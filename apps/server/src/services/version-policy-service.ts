/**
 * Version policy — the server-side single source of truth for the app
 * update machinery (see @app/shared/domain/version-policy).
 *
 * Read path: `getPolicy` backs BOTH the public `GET /api/version-policy`
 * endpoint and the per-request 426 upgrade gate, so it caches per process
 * with a short TTL — the gate must not cost one DB query per API request.
 *
 * Write path: admin upserts run in a transaction with an audit entry, then
 * broadcast on pub/sub so every instance drops its cache immediately
 * (staleness is otherwise bounded by the TTL).
 */
import type { Platform } from '@app/shared/domain/platform';
import type { UpsertVersionPolicyInput, VersionPolicy } from '@app/shared/domain/version-policy';
import { nowUtc } from '@app/shared/time';

import { NotFoundError } from '../lib/errors';
import { CHANNELS, type PubSub } from '../pubsub';
import type {
  AuditLogRepository,
  UnitOfWork,
  VersionPolicyRepository,
} from '../repositories/types';

const DEFAULT_CACHE_TTL_MS = 30_000;

interface VersionPolicyServiceDeps {
  policies: VersionPolicyRepository;
  auditLogs: AuditLogRepository;
  uow: UnitOfWork;
  events: PubSub;
  cacheTtlMs?: number;
  /** Injectable clock for tests. */
  nowMs?: () => number;
}

interface CacheEntry {
  policy: VersionPolicy | null;
  expiresAtMs: number;
}

export class VersionPolicyService {
  private readonly cache = new Map<Platform, CacheEntry>();
  private readonly cacheTtlMs: number;
  private readonly nowMs: () => number;

  constructor(private readonly deps: VersionPolicyServiceDeps) {
    this.cacheTtlMs = deps.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
    this.nowMs = deps.nowMs ?? Date.now;
  }

  /** Cached read; `null` when no policy row exists for the platform. */
  async getPolicy(platform: Platform): Promise<VersionPolicy | null> {
    const cached = this.cache.get(platform);
    if (cached && cached.expiresAtMs > this.nowMs()) return cached.policy;

    const policy = await this.deps.policies.findByPlatform(platform);
    this.cache.set(platform, { policy, expiresAtMs: this.nowMs() + this.cacheTtlMs });
    return policy;
  }

  /** Uncached read for the public endpoint; throws when unconfigured. */
  async requirePolicy(platform: Platform): Promise<VersionPolicy> {
    const policy = await this.getPolicy(platform);
    if (!policy) throw new NotFoundError('version-policy', platform);
    return policy;
  }

  async upsert(platform: Platform, input: UpsertVersionPolicyInput): Promise<VersionPolicy> {
    const policy: VersionPolicy = { platform, ...input, updatedAt: nowUtc() };

    // ── Transaction boundary: policy row + audit entry are atomic. ──
    await this.deps.uow.run(async (tx) => {
      await this.deps.policies.upsert(policy, tx);
      await this.deps.auditLogs.append(
        {
          entityType: 'version-policy',
          entityId: platform,
          action: 'version-policy.upserted',
          payload: input,
          createdAt: policy.updatedAt,
        },
        tx,
      );
    });

    this.invalidate(platform);
    // Other instances drop their cache via this broadcast (see src/index.ts).
    await this.deps.events.publish(CHANNELS.versionPolicyChanged, { platform });
    return policy;
  }

  /** Drops the local cache (one platform, or everything). */
  invalidate(platform?: Platform): void {
    if (platform) this.cache.delete(platform);
    else this.cache.clear();
  }
}
