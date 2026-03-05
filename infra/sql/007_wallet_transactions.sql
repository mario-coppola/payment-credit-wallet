CREATE TYPE wallet_tx_type AS ENUM ('credit', 'debit');

CREATE TABLE IF NOT EXISTS wallet_transactions (
  id                BIGSERIAL PRIMARY KEY,
  wallet_id         BIGINT NOT NULL REFERENCES wallets(id),
  type              wallet_tx_type NOT NULL,
  amount            INTEGER NOT NULL CHECK (amount > 0),
  balance_after     INTEGER NOT NULL CHECK (balance_after >= 0),
  idempotency_key   TEXT NOT NULL UNIQUE,
  reference_id      TEXT,
  reference_type    TEXT,
  metadata          JSONB,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wallet_transactions_wallet_id
  ON wallet_transactions (wallet_id);

CREATE INDEX IF NOT EXISTS idx_wallet_transactions_idempotency_key
  ON wallet_transactions (idempotency_key);