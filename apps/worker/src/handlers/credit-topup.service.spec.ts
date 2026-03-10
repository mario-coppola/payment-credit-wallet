import { db } from '../db';
import { logger } from '@pkg/shared';
import { CreditTopupRepository } from './credit-topup.repository';
import { CreditTopupService } from './credit-topup.service';
import { WalletService } from '../wallet/wallet.service';
import { EventLedgerNotFoundError, MalformedPayloadError } from '../errors';
import type { Job } from '../jobs/job.types';
import type { Wallet, WalletTransaction } from '../wallet/wallet.types';

jest.mock('../db', () => ({ db: { connect: jest.fn() } }));
jest.mock('@pkg/shared', () => ({
  logger: { info: jest.fn(), error: jest.fn() },
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockJob: Job = {
  id: 1,
  event_ledger_id: 10,
  event_type: 'stripe.checkout.session.completed',
} as Job;

const mockWallet: Wallet = {
  id: 4,
  user_id: 'user-test-1',
  balance: 0,
  created_at: new Date('2024-01-01'),
  updated_at: new Date('2024-01-01'),
};

const mockTransaction: WalletTransaction = {
  id: 1,
  wallet_id: 4,
  type: 'credit',
  amount: 100,
  balance_after: 100,
  idempotency_key: 'credit_topup:pi_123',
  reference_id: null,
  reference_type: null,
  metadata: null,
  created_at: new Date('2024-01-01'),
};

const validPayload = {
  data: {
    object: {
      payment_intent: 'pi_123',
      amount_total: 1000,
      metadata: {
        user_id: 'user-test-1',
        credits_to_add: '100',
      },
    },
  },
};

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

function makeClientMock() {
  return {
    query: jest.fn(),
    release: jest.fn(),
  };
}

function makeRepoMock(): jest.Mocked<
  Pick<CreditTopupRepository, 'insertPending' | 'markSucceeded'>
> {
  return {
    insertPending: jest.fn(),
    markSucceeded: jest.fn(),
  };
}

function makeWalletServiceMock(): jest.Mocked<
  Pick<WalletService, 'getOrCreateWallet' | 'creditWallet'>
> {
  return {
    getOrCreateWallet: jest.fn(),
    creditWallet: jest.fn(),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CreditTopupService', () => {
  let service: CreditTopupService;
  let repo: ReturnType<typeof makeRepoMock>;
  let walletService: ReturnType<typeof makeWalletServiceMock>;
  let client: ReturnType<typeof makeClientMock>;

  beforeEach(() => {
    client = makeClientMock();
    repo = makeRepoMock();
    walletService = makeWalletServiceMock();
    (db.connect as jest.Mock).mockResolvedValue(client);
    service = new CreditTopupService(
      repo as unknown as CreditTopupRepository,
      walletService as unknown as WalletService,
    );
  });

  describe('processCheckoutSessionCompleted', () => {
    it('processes valid job end-to-end', async () => {
      // Arrange
      client.query.mockResolvedValue({ rows: [{ raw_payload: validPayload }] });
      walletService.getOrCreateWallet.mockResolvedValue(mockWallet);
      walletService.creditWallet.mockResolvedValue(mockTransaction);
      repo.insertPending.mockResolvedValue(undefined);
      repo.markSucceeded.mockResolvedValue(undefined);

      // Act
      await service.processCheckoutSessionCompleted(mockJob);

      // Assert
      expect(repo.insertPending).toHaveBeenCalledWith(
        client,
        'credit_topup:pi_123',
        'pi_123',
        4,
        1000,
        100,
      );
      expect(walletService.creditWallet).toHaveBeenCalledWith({
        walletId: 4,
        amount: 100,
        idempotencyKey: 'credit_topup:pi_123',
      });
      expect(repo.markSucceeded).toHaveBeenCalledWith(
        client,
        'credit_topup:pi_123',
      );
      expect(client.release).toHaveBeenCalled();
    });

    it('throws EventLedgerNotFoundError when event not found', async () => {
      // Arrange
      client.query.mockResolvedValue({ rows: [] });

      // Act & Assert
      await expect(
        service.processCheckoutSessionCompleted(mockJob),
      ).rejects.toThrow(EventLedgerNotFoundError);
      expect(client.release).toHaveBeenCalled();
    });

    it('throws MalformedPayloadError when payment_intent missing', async () => {
      // Arrange
      const payload = {
        data: {
          object: {
            amount_total: 1000,
            metadata: { user_id: 'user-test-1', credits_to_add: '100' },
          },
        },
      };
      client.query.mockResolvedValue({ rows: [{ raw_payload: payload }] });
      walletService.getOrCreateWallet.mockResolvedValue(mockWallet);

      // Act & Assert
      await expect(
        service.processCheckoutSessionCompleted(mockJob),
      ).rejects.toThrow(MalformedPayloadError);
    });

    it('throws MalformedPayloadError when metadata.user_id missing', async () => {
      // Arrange
      const payload = {
        data: {
          object: {
            payment_intent: 'pi_123',
            amount_total: 1000,
            metadata: { credits_to_add: '100' },
          },
        },
      };
      client.query.mockResolvedValue({ rows: [{ raw_payload: payload }] });
      walletService.getOrCreateWallet.mockResolvedValue(mockWallet);

      // Act & Assert
      await expect(
        service.processCheckoutSessionCompleted(mockJob),
      ).rejects.toThrow(MalformedPayloadError);
    });

    it('handles duplicate: 23505 → logs info and returns void', async () => {
      // Arrange
      client.query.mockResolvedValue({ rows: [{ raw_payload: validPayload }] });
      walletService.getOrCreateWallet.mockResolvedValue(mockWallet);
      repo.insertPending.mockRejectedValue({ code: '23505' });

      // Act & Assert
      await expect(
        service.processCheckoutSessionCompleted(mockJob),
      ).resolves.toBeUndefined();
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({ service: 'worker' }),
        'duplicate credit topup',
      );
      expect(client.release).toHaveBeenCalled();
    });

    it('propagates unknown errors and releases client', async () => {
      // Arrange
      const dbError = new Error('db error');
      client.query.mockResolvedValue({ rows: [{ raw_payload: validPayload }] });
      walletService.getOrCreateWallet.mockResolvedValue(mockWallet);
      repo.insertPending.mockRejectedValue(dbError);

      // Act & Assert
      await expect(
        service.processCheckoutSessionCompleted(mockJob),
      ).rejects.toThrow('db error');
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ service: 'worker' }),
        'credit topup failed',
      );
      expect(client.release).toHaveBeenCalled();
    });
  });
});
