CREATE TABLE IF NOT EXISTS credit_topups (
  id                  BIGSERIAL PRIMARY KEY,
  idempotency_key     TEXT NOT NULL UNIQUE,
  wallet_id           BIGINT NOT NULL REFERENCES wallets(id),
  payment_intent_id   TEXT NOT NULL,
  amount_cents        INTEGER NOT NULL,
  credits_granted     INTEGER NOT NULL,
  status              TEXT NOT NULL CHECK (status IN ('pending', 'succeeded', 'failed')),
  error_message       TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_credit_topups_payment_intent_id
  ON credit_topups (payment_intent_id);

CREATE INDEX IF NOT EXISTS idx_credit_topups_wallet_id
  ON credit_topups (wallet_id);