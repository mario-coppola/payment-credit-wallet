CREATE TABLE IF NOT EXISTS wallets (
  id          BIGSERIAL PRIMARY KEY,
  user_id     TEXT NOT NULL UNIQUE,
  balance     INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wallets_user_id ON wallets (user_id);