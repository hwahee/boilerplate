-- 0001_init: full schema for the mobile boilerplate.
--
-- Timestamps are timestamptz; the application always writes UTC
-- (see @app/shared/time). Never store naive local times.

-- ── Demo domain ─────────────────────────────────────────────────────────────

CREATE TABLE todos (
  id          uuid PRIMARY KEY,
  title       text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  status      text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Covering the list endpoint's filter + keyset orderings (created_at/title, id).
CREATE INDEX todos_status_idx ON todos (status);
CREATE INDEX todos_created_at_idx ON todos (created_at DESC, id);
CREATE INDEX todos_title_idx ON todos (title, id);

-- Append-only audit trail, written in the same transaction as the change
-- (see the services layer).
CREATE TABLE audit_logs (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entity_type  text NOT NULL,
  entity_id    text NOT NULL,
  action       text NOT NULL,
  payload      jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX audit_logs_entity_idx ON audit_logs (entity_type, entity_id);

-- ── App version / update policy (single source of truth) ────────────────────
-- One row per platform. Raising min_supported_version is the ONLY sanctioned
-- way to retire old app versions (they get 426 + the forced-update screen).

CREATE TABLE version_policies (
  platform               text PRIMARY KEY CHECK (platform IN ('ios', 'android')),
  min_supported_version  text NOT NULL,   -- semver, e.g. '1.2.0'
  latest_version         text NOT NULL,   -- semver
  update_mode            text NOT NULL CHECK (update_mode IN ('ota', 'store')),
  store_url              text NOT NULL,
  message                text,            -- optional operator note for the update UI
  updated_at             timestamptz NOT NULL DEFAULT now()
);

-- ── Remote config ────────────────────────────────────────────────────────────
-- key/value rows plus a single-row revision counter bumped on every change
-- (the revision doubles as the polling ETag and the WebSocket push payload).
--
-- Extension hook (schema-ready, intentionally unused by the current code):
-- `platform` and `min_app_version` allow per-platform / per-version overrides
-- later. Base rows keep both NULL; resolution order would be
-- (key, platform, min_app_version) > (key, platform) > (key).

CREATE TABLE app_config (
  key              text NOT NULL,
  value            jsonb NOT NULL,
  platform         text CHECK (platform IN ('ios', 'android')),
  min_app_version  text,
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX app_config_scope_uidx
  ON app_config (key, COALESCE(platform, '*'), COALESCE(min_app_version, '*'));

CREATE TABLE app_config_revision (
  only_row  boolean PRIMARY KEY DEFAULT true CHECK (only_row),
  revision  integer NOT NULL DEFAULT 0
);

INSERT INTO app_config_revision (only_row, revision) VALUES (true, 0);

-- ── Device push tokens ───────────────────────────────────────────────────────

CREATE TABLE device_push_tokens (
  token        text PRIMARY KEY,
  platform     text NOT NULL CHECK (platform IN ('ios', 'android')),
  app_version  text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX device_push_tokens_platform_idx ON device_push_tokens (platform);
