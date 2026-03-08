# Stripe Integration

## Flow

1. Client calls POST /checkout/session → returns Stripe Checkout URL
2. User completes payment on Stripe hosted page
3. Stripe sends POST /stripe/webhook with event checkout.session.completed
4. Webhook handler verifies signature with constructEvent
5. Event persisted to event_ledger + job created (atomic transaction)
6. Worker processes job → writes credit_topup → updates wallet

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

## Webhook ingestion guarantees

- Signature verified before any DB write
- `event_ledger` + `jobs` created in a single atomic transaction
- Duplicate events (same `event.id`) are silently ignored via 23505 on `external_event_id`
- Response 200 returned immediately — no synchronous processing