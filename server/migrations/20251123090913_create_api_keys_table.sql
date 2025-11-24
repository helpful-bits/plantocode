CREATE TABLE api_keys (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key_hash text NOT NULL UNIQUE,
  label text NULL,
  role_override text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz NULL,
  revoked_at timestamptz NULL,
  expires_at timestamptz NULL,
  request_count bigint NOT NULL DEFAULT 0
);

CREATE INDEX idx_api_keys_user_id ON api_keys(user_id);
CREATE INDEX idx_api_keys_active_expiry
  ON api_keys((revoked_at IS NULL), expires_at);
