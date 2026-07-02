-- 0001_init: todos + audit_logs
--
-- Timestamps are timestamptz; the application always writes UTC
-- (see src/shared/time). Never store naive local times.

CREATE TABLE todos (
  id          uuid PRIMARY KEY,
  title       text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  status      text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Covering the list endpoint's filter + default sort.
CREATE INDEX todos_status_idx ON todos (status);
CREATE INDEX todos_created_at_idx ON todos (created_at DESC, id);

-- Append-only audit trail, written in the same transaction as the change
-- (see TodoService).
CREATE TABLE audit_logs (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entity_type  text NOT NULL,
  entity_id    text NOT NULL,
  action       text NOT NULL,
  payload      jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX audit_logs_entity_idx ON audit_logs (entity_type, entity_id);
