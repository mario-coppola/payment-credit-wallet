import { Injectable } from '@nestjs/common';
import { logger } from '@pkg/shared';
import { WalletService } from '../wallet/wallet.service';
import { db } from '../db';
import {
  EventLedgerNotFoundError,
  MalformedPayloadError,
  isUniqueViolation,
} from '../errors';
import type { Job } from '../jobs/job.types';
import { CreditTopupRepository } from './credit-topup.repository';

@Injectable()
export class CreditTopupService {
  constructor(
    private readonly creditTopupRepository: CreditTopupRepository,
    private readonly walletService: WalletService,
  ) {}

  async processCheckoutSessionCompleted(job: Job): Promise<void> {
    const client = await db.connect();
    try {
      const ledgerResult = await client.query<{ raw_payload: unknown }>(
        'SELECT raw_payload FROM event_ledger WHERE id = $1',
        [job.event_ledger_id],
      );

      if (ledgerResult.rows.length === 0) {
        throw new EventLedgerNotFoundError(job.event_ledger_id);
      }

      const rawPayload = ledgerResult.rows[0].raw_payload;
      const session =
        rawPayload !== null &&
        typeof rawPayload === 'object' &&
        'data' in rawPayload &&
        rawPayload.data !== null &&
        typeof rawPayload.data === 'object' &&
        'object' in rawPayload.data
          ? (rawPayload.data as { object: unknown }).object
          : null;

      if (session === null || typeof session !== 'object') {
        throw new MalformedPayloadError('missing data.object');
      }

      const obj = session as Record<string, unknown>;

      if (typeof obj['payment_intent'] !== 'string') {
        throw new MalformedPayloadError('missing payment_intent');
      }

      const metadata =
        obj['metadata'] !== null && typeof obj['metadata'] === 'object'
          ? (obj['metadata'] as Record<string, unknown>)
          : null;

      if (metadata === null) {
        throw new MalformedPayloadError('missing metadata');
      }

      if (typeof metadata['user_id'] !== 'string') {
        throw new MalformedPayloadError('missing metadata.user_id');
      }

      if (typeof metadata['credits_to_add'] !== 'string') {
        throw new MalformedPayloadError('missing metadata.credits_to_add');
      }

      const paymentIntentId = obj['payment_intent'];
      const userId = metadata['user_id'];
      const credits = parseInt(metadata['credits_to_add'], 10);

      if (isNaN(credits)) {
        throw new MalformedPayloadError('invalid metadata.credits_to_add');
      }

      const idempotencyKey = `credit_topup:${paymentIntentId}`;

      try {
        await this.creditTopupRepository.insertPending(
          client,
          idempotencyKey,
          paymentIntentId,
          userId,
          credits,
        );

        const wallet = await this.walletService.getOrCreateWallet(userId);

        await this.walletService.creditWallet({
          walletId: wallet.id,
          amount: credits,
          idempotencyKey,
        });

        await this.creditTopupRepository.markSucceeded(client, idempotencyKey);

        logger.info(
          {
            service: 'worker',
            job_id: job.id,
            payment_intent_id: paymentIntentId,
            user_id: userId,
            credits,
          },
          'credit topup applied',
        );
      } catch (err: unknown) {
        if (isUniqueViolation(err)) {
          logger.info(
            {
              service: 'worker',
              job_id: job.id,
              payment_intent_id: paymentIntentId,
            },
            'duplicate credit topup',
          );
          return;
        }

        logger.error(
          {
            service: 'worker',
            job_id: job.id,
            payment_intent_id: paymentIntentId,
            error: err,
          },
          'credit topup failed',
        );

        throw err;
      }
    } finally {
      client.release();
    }
  }
}
