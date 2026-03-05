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

All other event types are ingested and marked done without side effects.

## Local development

stripe listen --forward-to localhost:3000/stripe/webhook

Signing secret from CLI output → STRIPE_WEBHOOK_SECRET in .env