# Payment Credit Wallet

A production-grade credit wallet system with Stripe integration,
built on top of a reliable event processing baseline.

## What this project demonstrates

- Stripe Checkout + webhook processing with signature verification
- Credit wallet with idempotent top-ups and race-condition-safe deductions
- Async job processing with bounded retries and audit trail
- Effect-level idempotency for financial operations

## Built on

This project extends [reliable-event-processing](https://github.com/mario-coppola/reliable-event-processing)
(baseline tag: `baseline-from-reliable-event-processing`).

The baseline provides: event ledger, job queue, worker, bounded retries, manual intervention, audit log.

This project adds: Stripe webhook ingestion, credit wallet, top-up flow, job-based credit processing.

## Stack

Node.js · NestJS · TypeScript · PostgreSQL · Stripe · Vercel

## Development

See `docs/dev-setup.md` for local setup.

## Architecture

See `docs/architecture.md`.

## Stripe integration

See `docs/stripe-integration.md`.

## Guarantees & failure modes

See `docs/guarantees.md`.