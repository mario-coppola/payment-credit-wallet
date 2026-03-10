# Architecture

## System layers

### Layer 1 — Reliable event processing (baseline)

Inherited from reliable-event-processing (M0–M3).

- Append-only event ledger
- Job queue with SELECT FOR UPDATE SKIP LOCKED
- Bounded retries with failure classification
- Manual intervention with append-only audit log
- Read-only admin endpoints

### Layer 2 — Credit wallet (this project)

- `wallets` — balance per user
- `wallet_transactions` — immutable ledger of all movements
- `credit_topups` — idempotent effect table for Stripe top-ups
- Deduction with SELECT FOR UPDATE to prevent race conditions

### Layer 3 — Stripe integration

- Checkout Session creation
- Webhook ingestion → event_ledger → job → credit_topup effect
- Signature verification at ingestion boundary
- payment_intent_id as idempotency anchor

## Database schema

### wallets

- `user_id` TEXT UNIQUE — one wallet per user, no FK constraint
- `balance` INTEGER CHECK >= 0 — denormalized column updated atomically with every transaction

### wallet_transactions

- Append-only ledger of all balance movements
- `idempotency_key` UNIQUE — prevents duplicate effects
- `balance_after` INTEGER — denormalized for audit purposes

### credit_topups

- Idempotent effect table for Stripe top-ups
- `idempotency_key` = `'credit_topup:<payment_intent_id>'`
- `status` — pending | succeeded | failed

## API endpoints

- `GET /wallets/:userId` — returns wallet or 404
- `GET /wallets/:userId/transactions` — paginated list, query params: `limit` (default 20, max 100), `offset` (default 0)
- `POST /checkout/session` — creates a Stripe Checkout Session, body: `{ userId, priceId, creditsToAdd }`, returns: `{ url, sessionId }`
- `POST /stripe/webhook` — receives Stripe webhook events, verifies signature, persists event to event_ledger and creates job atomically, returns `{ received: true }`

## Worker handlers

| Event type                            | Handler                         | Action                                                                 |
|---------------------------------------|---------------------------------|------------------------------------------------------------------------|
| `stripe.checkout.session.completed`   | `CreditTopupService`            | Reads `event_ledger` payload, writes `credit_topups` (idempotent), calls `WalletService.creditWallet` |
| `subscription.paid`                   | `SubscriptionActivationService` | Baseline handler — activates subscription                              |
| any other event type                  | —                               | Skipped: job marked done, no side effects                              |

`CreditTopupService` flow:
1. Reads `raw_payload` from `event_ledger`
2. Extracts `payment_intent_id`, `user_id`, `credits_to_add`, `amount_total` from `data.object`
3. Calls `getOrCreateWallet` to resolve `wallet_id`
4. Inserts into `credit_topups` with status `pending` (UNIQUE on `idempotency_key` guards duplicates)
5. Calls `creditWallet` — updates `wallets.balance` and inserts into `wallet_transactions` atomically
6. Updates `credit_topups` status to `succeeded`

## Data flow

Stripe checkout completed
→ POST /stripe/webhook
→ signature verified
→ event persisted to event_ledger (atomic with job creation)
→ 200 returned to Stripe immediately
→ worker claims job
→ credit_topup effect written (idempotent)
→ wallet balance updated atomically

## Repo structure

apps/api — HTTP: webhook ingestion, wallet endpoints
apps/worker — async: job processing, credit_topup execution
packages/shared — logger, shutdown helpers
infra/sql — schema migrations (001–006)
