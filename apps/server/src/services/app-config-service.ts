/**
 * Remote config business logic.
 *
 * Reads back the whole `app_config` table plus its monotonic revision; writes
 * bump the revision atomically and broadcast the new revision on pub/sub so
 * every instance can push it to its WebSocket clients (fan-out happens in
 * src/app.ts via the pub/sub bridge — works across instances with the redis
 * driver).
 */
import { nowUtc } from '@app/shared/time';

import { CHANNELS, type PubSub } from '../pubsub';
import type {
  AppConfigRepository,
  AppConfigSnapshot,
  AuditLogRepository,
  UnitOfWork,
} from '../repositories/types';

interface AppConfigServiceDeps {
  config: AppConfigRepository;
  auditLogs: AuditLogRepository;
  uow: UnitOfWork;
  events: PubSub;
}

export class AppConfigService {
  constructor(private readonly deps: AppConfigServiceDeps) {}

  /**
   * Full snapshot for `GET /api/app-config`. No server-side cache: the
   * endpoint is already 304-cheap via the revision ETag, and correctness of
   * the kill switch (maintenance mode) beats saving one indexed SELECT.
   */
  async get(): Promise<AppConfigSnapshot> {
    return this.deps.config.getAll();
  }

  /** Admin upsert of a single key. Returns the new revision. */
  async set(key: string, value: unknown): Promise<{ revision: number }> {
    // ── Transaction boundary: config write + revision bump + audit are atomic. ──
    const revision = await this.deps.uow.run(async (tx) => {
      const next = await this.deps.config.set(key, value, tx);
      await this.deps.auditLogs.append(
        {
          entityType: 'app-config',
          entityId: key,
          action: 'app-config.set',
          payload: { value },
          createdAt: nowUtc(),
        },
        tx,
      );
      return next;
    });

    // Push path: WebSocket clients learn the new revision instantly and
    // refetch; polling clients catch up on their next interval.
    await this.deps.events.publish(CHANNELS.configChanged, { revision });
    return { revision };
  }
}
