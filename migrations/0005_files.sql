-- 0005_files: uploaded files
--
-- One row per upload. The bytes are not here: they live in the blob store
-- (STORAGE_DRIVER — a local directory, S3, Google Drive) under storage_ref.
-- A file's bytes never change, so its address can be cached forever.

CREATE TABLE files (
  id            uuid PRIMARY KEY,
  -- The member server's id of the uploader. NULL when uploaded without
  -- sign-in (AUTH_DRIVER=none). Deliberately no foreign key: this service
  -- keeps no members table.
  owner_id      text,
  -- The name it was uploaded under; shown and offered on download, never a path.
  name          text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 255),
  content_type  text NOT NULL,
  size_bytes    bigint NOT NULL CHECK (size_bytes > 0),
  -- Hex SHA-256 of the bytes; served as the ETag.
  sha256        text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  -- What the blob store calls it: the key for local/S3, the Drive file id for Google Drive.
  storage_ref   text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX files_owner_id_idx ON files (owner_id);
