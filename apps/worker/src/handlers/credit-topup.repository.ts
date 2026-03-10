import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';

@Injectable()
export class CreditTopupRepository {
  async insertPending(
    client: PoolClient,
    idempotencyKey: string,
    paymentIntentId: string,
    walletId: number,
    amountCents: number,
    creditsGranted: number,
  ): Promise<void> {
    await client.query(
      `INSERT INTO credit_topups
        (idempotency_key, payment_intent_id, wallet_id,
         amount_cents, credits_granted, status)
       VALUES ($1, $2, $3, $4, $5, 'pending')`,
      [idempotencyKey, paymentIntentId, walletId, amountCents, creditsGranted],
    );
  }

  async markSucceeded(
    client: PoolClient,
    idempotencyKey: string,
  ): Promise<void> {
    await client.query(
      `UPDATE credit_topups
       SET status = 'succeeded', updated_at = NOW()
       WHERE idempotency_key = $1`,
      [idempotencyKey],
    );
  }
}
