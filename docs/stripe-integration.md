# Stripe Integration

## Flow

1. Client calls POST /checkout/session → returns Stripe Checkout URL
2. User completes payment on Stripe hosted page
3. Stripe sends POST /stripe/webhook with event checkout.session.completed
4. Webhook handler verifies signature with constructEvent
5. Event persisted to event_ledger + job created (atomic transaction)
6. Worker claims job from `jobs` table
7. Worker reads `raw_payload` from `event_ledger`
8. Extracts `payment_intent_id`, `user_id`, `credits_to_add`, `amount_total` from checkout session object (`data.object`)
9. Inserts into `credit_topups` with status `pending` (idempotency guard via UNIQUE `idempotency_key`)
10. Calls `creditWallet` → updates `wallets.balance` and inserts `wallet_transactions` atomically
11. Updates `credit_topups` status to `succeeded`

## Idempotency

Idempotency key: `credit_topup:<payment_intent_id>`

payment_intent_id is stable, unique per payment, and present in
checkout.session.completed. Used as UNIQUE constraint on credit_topups table.

## Webhook events handled

|             Event          |         Action        |
|----------------------------|-----------------------|
| checkout.session.completed | Trigger credit top-up |

All other event types receive a 200 response with no side effects (silent ignore).

## Local development

stripe listen --forward-to localhost:3000/stripe/webhook

Signing secret from CLI output → STRIPE_WEBHOOK_SECRET in .env

## Checkout flow

Client calls `POST /checkout/session`
→ `StripeService` creates a Checkout Session with metadata (`user_id`, `credits_to_add`)
→ returns `url`
→ client redirects the user to the Stripe-hosted checkout page
→ Stripe handles payment
→ on completion, Stripe sends `checkout.session.completed` webhook

Note: `credits_to_add` is stored as a string in Stripe metadata (Stripe metadata values
are always strings). The webhook handler must parse it with `parseInt` before crediting
the wallet.

## Payload validation

The worker expects the following fields in `data.object` of the Stripe event:

- `payment_intent` (string) — used as idempotency anchor
- `amount_total` (number) — payment amount in cents
- `metadata.user_id` (string) — target user
- `metadata.credits_to_add` (string, parsed as integer) — credits to grant

If any field is missing or has the wrong type, the worker throws `MalformedPayloadError`.
This is classified as a permanent failure: the job is not retried.

## Webhook ingestion guarantees

- Signature verified before any DB write
- `event_ledger` + `jobs` created in a single atomic transaction
- Duplicate events (same `event.id`) are silently ignored via 23505 on `external_event_id`
- Response 200 returned immediately — no synchronous processing