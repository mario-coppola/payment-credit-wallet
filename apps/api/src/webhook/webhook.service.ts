import { Injectable } from '@nestjs/common';
import type Stripe from 'stripe';
import { logger } from '@pkg/shared';
import { db } from '../db';
import { isUniqueViolation } from '../wallet/errors';
import { WebhookRepository } from './webhook.repository';

@Injectable()
export class WebhookService {
  constructor(private readonly webhookRepository: WebhookRepository) {}

  async ingestCheckoutEvent(event: Stripe.Event): Promise<void> {
    const client = await db.connect();

    try {
      await client.query('BEGIN');
      await this.webhookRepository.persistEventAndJob(client, event);
      await client.query('COMMIT');
    } catch (err: unknown) {
      await client.query('ROLLBACK');

      if (isUniqueViolation(err)) {
        logger.warn(
          { service: 'api', event_id: event.id },
          'duplicate stripe webhook event — skipping',
        );
        return;
      }

      throw err;
    } finally {
      client.release();
    }

    logger.info(
      { service: 'api', event_type: event.type, event_id: event.id },
      'stripe webhook received',
    );
  }
}
