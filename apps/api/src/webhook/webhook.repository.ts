import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import type Stripe from 'stripe';

@Injectable()
export class WebhookRepository {
  async persistEventAndJob(
    client: PoolClient,
    event: Stripe.Event,
  ): Promise<void> {
    const res = await client.query<{ id: number }>(
      `
      INSERT INTO event_ledger (event_type, external_event_id, raw_payload)
      VALUES ($1, $2, $3::jsonb)
      RETURNING id
      `,
      ['stripe.checkout.session.completed', event.id, JSON.stringify(event)],
    );

    const eventLedgerId = res.rows[0]?.id;

    await client.query(
      `
      INSERT INTO jobs (status, event_ledger_id, event_type, external_event_id, max_attempts, available_at)
      VALUES ('queued', $1, $2, $3, 3, NOW())
      `,
      [eventLedgerId, 'stripe.checkout.session.completed', event.id],
    );
  }
}
