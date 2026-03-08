import { db } from '../db';
import { logger } from '@pkg/shared';
import { WebhookRepository } from './webhook.repository';
import { WebhookService } from './webhook.service';
import type Stripe from 'stripe';

jest.mock('../db', () => ({ db: { connect: jest.fn() } }));
jest.mock('@pkg/shared', () => ({
  logger: { info: jest.fn(), warn: jest.fn() },
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockEvent = {
  type: 'checkout.session.completed',
  id: 'evt_123',
} as Stripe.Event;

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

function makeClientMock() {
  return {
    query: jest.fn().mockResolvedValue({}),
    release: jest.fn(),
  };
}

function makeRepoMock(): jest.Mocked<Pick<WebhookRepository, 'persistEventAndJob'>> {
  return {
    persistEventAndJob: jest.fn(),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WebhookService', () => {
  let service: WebhookService;
  let repo: ReturnType<typeof makeRepoMock>;
  let client: ReturnType<typeof makeClientMock>;

  beforeEach(() => {
    client = makeClientMock();
    repo = makeRepoMock();
    (db.connect as jest.Mock).mockResolvedValue(client);
    service = new WebhookService(repo as unknown as WebhookRepository);
  });

  // -------------------------------------------------------------------------
  // ingestCheckoutEvent
  // -------------------------------------------------------------------------

  describe('ingestCheckoutEvent', () => {
    it('executes BEGIN/COMMIT and calls persistEventAndJob on success', async () => {
      // Arrange
      repo.persistEventAndJob.mockResolvedValue(undefined);

      // Act
      await service.ingestCheckoutEvent(mockEvent);

      // Assert
      expect(client.query).toHaveBeenCalledWith('BEGIN');
      expect(repo.persistEventAndJob).toHaveBeenCalledWith(client, mockEvent);
      expect(client.query).toHaveBeenCalledWith('COMMIT');
      expect(client.release).toHaveBeenCalled();

      const calls = (client.query as jest.Mock).mock.calls.map(
        (c: unknown[]) => c[0],
      );
      expect(calls.indexOf('BEGIN')).toBeLessThan(calls.indexOf('COMMIT'));
    });

    it('handles duplicate event: 23505 → ROLLBACK, logs warning, returns void', async () => {
      // Arrange
      repo.persistEventAndJob.mockRejectedValue({ code: '23505' });

      // Act & Assert
      await expect(
        service.ingestCheckoutEvent(mockEvent),
      ).resolves.toBeUndefined();
      expect(client.query).toHaveBeenCalledWith('ROLLBACK');
      expect(logger.warn).toHaveBeenCalled();
    });

    it('propagates unknown errors and executes ROLLBACK', async () => {
      // Arrange
      const dbError = new Error('db error');
      repo.persistEventAndJob.mockRejectedValue(dbError);

      // Act & Assert
      await expect(service.ingestCheckoutEvent(mockEvent)).rejects.toThrow(
        'db error',
      );
      expect(client.query).toHaveBeenCalledWith('ROLLBACK');
      expect(client.release).toHaveBeenCalled();
    });
  });
});
