/**
 * Remote config (`app_config` table) — server-controlled runtime settings.
 *
 * Wire shape (`GET /api/app-config`):
 *   { "revision": 17, "entries": { "<key>": <json>, … } }
 *
 * `revision` increases monotonically on every change; it doubles as the ETag
 * (`"cfg-<revision>"`) for 304-cheap polling and as the payload of the
 * WebSocket change broadcast.
 *
 * Parsing policy (unit-tested): each well-known key is validated
 * INDEPENDENTLY and falls back to its default when malformed — one bad row
 * in the DB must never brick every app in the field. Unknown keys are
 * preserved in `entries` for forward compatibility but ignored here.
 */
import { s, toValidator, type Infer } from '../validation';

/** Well-known config keys. Add new ones here, never as ad-hoc strings. */
export const CONFIG_KEYS = {
  maintenance: 'maintenance',
  noticeBanner: 'noticeBanner',
  features: 'features',
  bootAd: 'bootAd',
  configPolling: 'configPolling',
} as const;

/** Envelope of `GET /api/app-config` — validated by the app before use. */
export const appConfigResponseValidator = toValidator(
  s.object({
    revision: s.int().check(s.gte(0)),
    entries: s.record(s.string(), s.unknown()),
  }),
);
export type AppConfigResponse = Infer<typeof appConfigResponseValidator>;

// ─── Per-key schemas and defaults ───────────────────────────────────────────

/** Kill switch: when enabled the entire app shows the maintenance screen. */
const maintenanceValidator = toValidator(
  s.object({
    enabled: s.boolean(),
    /** Optional operator message; `null` shows the localized default copy. */
    message: s._default(s.nullable(s.string()), null),
  }),
);
export type MaintenanceConfig = Infer<typeof maintenanceValidator>;

/** Dismissible in-app notice shown at the top of the home screen. */
const noticeBannerValidator = toValidator(
  s.object({
    enabled: s.boolean(),
    text: s._default(s.string(), ''),
    /** Optional link opened when the banner is tapped. */
    url: s._default(s.nullable(s.string()), null),
  }),
);
export type NoticeBannerConfig = Infer<typeof noticeBannerValidator>;

/** Feature flags: flat `name → on/off`. Consumed via `useConfig().features`. */
const featuresValidator = toValidator(s.record(s.string(), s.boolean()));

/** Boot-screen ad slot behavior (see apps/mobile/src/ads). */
const bootAdValidator = toValidator(
  s.object({
    enabled: s.boolean(),
    /** The ad stays visible at least this long once shown. */
    minShowMs: s._default(s.int().check(s.gte(0), s.lte(10_000)), 1500),
    /** Give up waiting for the ad after this long — NEVER block app entry. */
    timeoutMs: s._default(s.int().check(s.gte(100), s.lte(30_000)), 4000),
    skippable: s._default(s.boolean(), true),
  }),
);
export type BootAdConfig = Infer<typeof bootAdValidator>;

/** Client polling cadence for this very config endpoint. */
const configPollingValidator = toValidator(
  s.object({
    intervalMs: s._default(s.int().check(s.gte(5_000), s.lte(3_600_000)), 60_000),
  }),
);

/** The fully-parsed, always-complete config object the app consumes. */
export interface AppConfig {
  maintenance: MaintenanceConfig;
  noticeBanner: NoticeBannerConfig;
  features: Record<string, boolean>;
  bootAd: BootAdConfig;
  configPolling: Infer<typeof configPollingValidator>;
}

export const DEFAULT_APP_CONFIG: AppConfig = {
  maintenance: { enabled: false, message: null },
  noticeBanner: { enabled: false, text: '', url: null },
  features: {},
  bootAd: { enabled: false, minShowMs: 1500, timeoutMs: 4000, skippable: true },
  configPolling: { intervalMs: 60_000 },
};

function parseKey<T>(
  entries: Record<string, unknown>,
  key: string,
  fallback: T,
  validator: { safeParse(input: unknown): { ok: true; value: T } | { ok: false } },
): T {
  if (!(key in entries)) return fallback;
  const result = validator.safeParse(entries[key]);
  return result.ok ? result.value : fallback;
}

/**
 * Turns raw `entries` into a complete {@link AppConfig}. Missing or
 * malformed keys resolve to {@link DEFAULT_APP_CONFIG} values — never throws.
 */
export function parseAppConfig(entries: Record<string, unknown>): AppConfig {
  const d = DEFAULT_APP_CONFIG;
  return {
    maintenance: parseKey(entries, CONFIG_KEYS.maintenance, d.maintenance, maintenanceValidator),
    noticeBanner: parseKey(
      entries,
      CONFIG_KEYS.noticeBanner,
      d.noticeBanner,
      noticeBannerValidator,
    ),
    features: parseKey(entries, CONFIG_KEYS.features, d.features, featuresValidator),
    bootAd: parseKey(entries, CONFIG_KEYS.bootAd, d.bootAd, bootAdValidator),
    configPolling: parseKey(
      entries,
      CONFIG_KEYS.configPolling,
      d.configPolling,
      configPollingValidator,
    ),
  };
}

/** Body of the admin upsert (`PUT /api/admin/app-config/:key`): any JSON value. */
export const upsertConfigEntryValidator = toValidator(
  s.object({
    value: s.unknown(),
  }),
);
