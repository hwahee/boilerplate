/**
 * Server configuration — every environment-dependent value enters the process
 * here, validated once at boot. Switching local/development/production is a
 * pure configuration change (.env file or environment variables); no code
 * changes are ever required. Secrets are only ever read from the environment
 * and must never be committed (see .env.example).
 */
import { s, toValidator, type Infer } from '@app/shared/validation';

const configValidator = toValidator(
  s.object({
    appEnv: s._default(s.enum(['local', 'development', 'production']), 'local'),
    port: s._default(s.int().check(s.gte(0), s.lte(65535)), 3000),
    /** `memory` runs without any external service — used by tests and quick hacking. */
    dbDriver: s._default(s.enum(['postgres', 'memory']), 'postgres'),
    databaseUrl: s.optional(s.string().check(s.minLength(1))),
    /**
     * Explicit CORS allowlist. Native apps are not subject to CORS; this
     * exists for future browser callers (e.g. an admin console). Empty = none.
     */
    corsOrigins: s._default(s.array(s.string().check(s.minLength(1))), []),
    /** Cross-instance pub/sub driver; switch to `redis` when scaling horizontally. */
    pubsubDriver: s._default(s.enum(['memory', 'redis']), 'memory'),
    redisUrl: s.optional(s.string().check(s.minLength(1))),
    /** `web` = HTTP only, `worker` = background jobs only, `all` = both. */
    serverRole: s._default(s.enum(['web', 'worker', 'all']), 'all'),
    /** Push notification driver: `dry-run` logs sends, `expo` calls the Expo push API. */
    pushDriver: s._default(s.enum(['dry-run', 'expo']), 'dry-run'),
    /** Bearer token for /api/admin/*; undefined disables the admin API entirely. */
    adminToken: s.optional(s.string().check(s.minLength(16))),
    shutdownDrainMs: s._default(s.int().check(s.gte(0), s.lte(60_000)), 3000),
  }),
);

export type ServerConfig = Infer<typeof configValidator>;

function numberOrUndefined(value: string | undefined): number | undefined {
  return value === undefined || value === '' ? undefined : Number(value);
}

function stringOrUndefined(value: string | undefined): string | undefined {
  return value === undefined || value === '' ? undefined : value;
}

export function loadServerConfig(
  env: Record<string, string | undefined> = process.env,
): ServerConfig {
  const config = configValidator.parse({
    appEnv: env.APP_ENV,
    port: numberOrUndefined(env.PORT),
    dbDriver: env.DB_DRIVER,
    databaseUrl: stringOrUndefined(env.DATABASE_URL),
    corsOrigins: (env.CORS_ORIGINS ?? '')
      .split(',')
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0),
    pubsubDriver: env.PUBSUB_DRIVER,
    redisUrl: stringOrUndefined(env.REDIS_URL),
    serverRole: env.SERVER_ROLE,
    pushDriver: env.PUSH_DRIVER,
    adminToken: stringOrUndefined(env.ADMIN_TOKEN),
    shutdownDrainMs: numberOrUndefined(env.SHUTDOWN_DRAIN_MS),
  });

  if (config.dbDriver === 'postgres' && !config.databaseUrl) {
    throw new Error('DATABASE_URL is required when DB_DRIVER=postgres');
  }
  if (config.pubsubDriver === 'redis' && !config.redisUrl) {
    throw new Error('REDIS_URL is required when PUBSUB_DRIVER=redis');
  }
  return config;
}
