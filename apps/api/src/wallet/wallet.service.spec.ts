import { db } from '../db';
import { WalletRepository } from './wallet.repository';
import { WalletService } from './wallet.service';
import { WalletNotFoundError, InsufficientBalanceError } from './errors';
import type {
  Wallet,
  WalletTransaction,
  CreditParams,
  DebitParams,
} from './wallet.types';

jest.mock('../db', () => ({ db: { connect: jest.fn() } }));
jest.mock('@pkg/shared', () => ({
  logger: { info: jest.fn(), error: jest.fn() },
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockWallet: Wallet = {
  id: 1,
  user_id: 'user-123',
  balance: 100,
  created_at: new Date('2024-01-01'),
  updated_at: new Date('2024-01-01'),
};

const mockTransaction: WalletTransaction = {
  id: 10,
  wallet_id: 1,
  type: 'credit',
  amount: 50,
  balance_after: 150,
  idempotency_key: 'idem-key-1',
  reference_id: null,
  reference_type: null,
  metadata: null,
  created_at: new Date('2024-01-01'),
};

const creditParams: CreditParams = {
  walletId: 1,
  amount: 50,
  idempotencyKey: 'idem-key-1',
};

const debitParams: DebitParams = {
  walletId: 1,
  amount: 30,
  idempotencyKey: 'idem-key-2',
};

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

type RepoMock = Record<keyof WalletRepository, jest.Mock>;

function makeRepoMock(): RepoMock {
  return {
    createWallet: jest.fn(),
    findByUserId: jest.fn(),
    findById: jest.fn(),
    findTransactionByIdempotencyKey: jest.fn(),
    findTransactionsByWalletId: jest.fn(),
    updateBalanceAndReturnNew: jest.fn(),
    insertTransaction: jest.fn(),
    lockWalletForUpdate: jest.fn(),
    debitBalanceAndReturnNew: jest.fn(),
    insertDebitTransaction: jest.fn(),
  };
}

function makeClientMock() {
  return {
    query: jest.fn().mockResolvedValue({}),
    release: jest.fn(),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WalletService', () => {
  let service: WalletService;
  let repo: RepoMock;
  let client: ReturnType<typeof makeClientMock>;

  beforeEach(() => {
    repo = makeRepoMock();
    client = makeClientMock();
    (db.connect as jest.Mock).mockResolvedValue(client);
    service = new WalletService(repo as unknown as WalletRepository);
  });

  // -------------------------------------------------------------------------
  // getOrCreateWallet
  // -------------------------------------------------------------------------

  describe('getOrCreateWallet', () => {
    it('returns existing wallet without calling createWallet', async () => {
      // Arrange
      repo.findByUserId.mockResolvedValue(mockWallet);

      // Act
      const result = await service.getOrCreateWallet('user-123');

      // Assert
      expect(result).toBe(mockWallet);
      expect(repo.findByUserId).toHaveBeenCalledWith('user-123');
      expect(repo.createWallet).not.toHaveBeenCalled();
    });

    it('creates and returns new wallet when user has none', async () => {
      // Arrange
      const newWallet: Wallet = { ...mockWallet, id: 2 };
      repo.findByUserId.mockResolvedValue(null);
      repo.createWallet.mockResolvedValue(newWallet);

      // Act
      const result = await service.getOrCreateWallet('user-123');

      // Assert
      expect(result).toBe(newWallet);
      expect(repo.createWallet).toHaveBeenCalledWith('user-123');
    });

    it('handles race condition: createWallet 23505 → returns wallet from retry', async () => {
      // Arrange
      repo.findByUserId
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(mockWallet);
      repo.createWallet.mockRejectedValueOnce({ code: '23505' });

      // Act
      const result = await service.getOrCreateWallet('user-123');

      // Assert
      expect(result).toBe(mockWallet);
      expect(repo.findByUserId).toHaveBeenCalledTimes(2);
    });
  });

  // -------------------------------------------------------------------------
  // getWallet
  // -------------------------------------------------------------------------

  describe('getWallet', () => {
    it('returns wallet when found', async () => {
      // Arrange
      repo.findByUserId.mockResolvedValue(mockWallet);

      // Act
      const result = await service.getWallet('user-123');

      // Assert
      expect(result).toBe(mockWallet);
    });

    it('throws WalletNotFoundError when wallet does not exist', async () => {
      // Arrange
      repo.findByUserId.mockResolvedValue(null);

      // Act & Assert
      await expect(service.getWallet('user-123')).rejects.toThrow(
        WalletNotFoundError,
      );
    });
  });

  // -------------------------------------------------------------------------
  // getTransactions
  // -------------------------------------------------------------------------

  describe('getTransactions', () => {
    it('calls findTransactionsByWalletId with resolved wallet.id, limit, offset', async () => {
      // Arrange
      const txList = [mockTransaction];
      repo.findByUserId.mockResolvedValue(mockWallet);
      repo.findTransactionsByWalletId.mockResolvedValue(txList);

      // Act
      const result = await service.getTransactions('user-123', 20, 0);

      // Assert
      expect(repo.findTransactionsByWalletId).toHaveBeenCalledWith(
        mockWallet.id,
        20,
        0,
      );
      expect(result).toBe(txList);
    });

    it('throws WalletNotFoundError when wallet does not exist', async () => {
      // Arrange
      repo.findByUserId.mockResolvedValue(null);

      // Act & Assert
      await expect(service.getTransactions('user-123', 20, 0)).rejects.toThrow(
        WalletNotFoundError,
      );
      expect(repo.findTransactionsByWalletId).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // creditWallet
  // -------------------------------------------------------------------------

  describe('creditWallet', () => {
    it('executes BEGIN/COMMIT and returns transaction on success', async () => {
      // Arrange
      repo.updateBalanceAndReturnNew.mockResolvedValue(150);
      repo.insertTransaction.mockResolvedValue(mockTransaction);

      // Act
      const result = await service.creditWallet(creditParams);

      // Assert
      expect(client.query).toHaveBeenCalledWith('BEGIN');
      expect(repo.updateBalanceAndReturnNew).toHaveBeenCalledWith(
        1,
        50,
        client,
      );
      expect(repo.insertTransaction).toHaveBeenCalledWith(
        creditParams,
        150,
        client,
      );
      expect(client.query).toHaveBeenCalledWith('COMMIT');
      expect(client.release).toHaveBeenCalled();
      expect(result).toBe(mockTransaction);
    });

    it('handles idempotency: 23505 → ROLLBACK and returns existing transaction', async () => {
      // Arrange
      const existingTx: WalletTransaction = { ...mockTransaction, id: 99 };
      repo.updateBalanceAndReturnNew.mockResolvedValue(150);
      repo.insertTransaction.mockRejectedValueOnce({ code: '23505' });
      repo.findTransactionByIdempotencyKey.mockResolvedValue(existingTx);

      // Act
      const result = await service.creditWallet(creditParams);

      // Assert
      expect(client.query).toHaveBeenCalledWith('ROLLBACK');
      expect(repo.findTransactionByIdempotencyKey).toHaveBeenCalledWith(
        creditParams.idempotencyKey,
        client,
      );
      expect(result).toBe(existingTx);
    });

    it('throws WalletNotFoundError when idempotency key exists but transaction fetch returns null', async () => {
      // Arrange
      repo.updateBalanceAndReturnNew.mockResolvedValue(150);
      repo.insertTransaction.mockRejectedValueOnce({ code: '23505' });
      repo.findTransactionByIdempotencyKey.mockResolvedValue(null);

      // Act & Assert
      await expect(service.creditWallet(creditParams)).rejects.toThrow(
        WalletNotFoundError,
      );
      expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    });

    it('propagates WalletNotFoundError and executes ROLLBACK', async () => {
      // Arrange
      repo.updateBalanceAndReturnNew.mockRejectedValue(
        new WalletNotFoundError(1),
      );

      // Act & Assert
      await expect(service.creditWallet(creditParams)).rejects.toThrow(
        WalletNotFoundError,
      );
      expect(client.query).toHaveBeenCalledWith('ROLLBACK');
      expect(client.release).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // debitWallet
  // -------------------------------------------------------------------------

  describe('debitWallet', () => {
    const debitTx: WalletTransaction = {
      ...mockTransaction,
      type: 'debit',
      amount: 30,
      balance_after: 70,
    };

    it('executes full debit flow and returns transaction', async () => {
      // Arrange
      repo.lockWalletForUpdate.mockResolvedValue(mockWallet);
      repo.debitBalanceAndReturnNew.mockResolvedValue(70);
      repo.insertDebitTransaction.mockResolvedValue(debitTx);

      // Act
      const result = await service.debitWallet(debitParams);

      // Assert
      expect(client.query).toHaveBeenCalledWith('BEGIN');
      expect(repo.lockWalletForUpdate).toHaveBeenCalledWith(1, client);
      expect(repo.debitBalanceAndReturnNew).toHaveBeenCalledWith(1, 30, client);
      expect(repo.insertDebitTransaction).toHaveBeenCalledWith(
        debitParams,
        70,
        client,
      );
      expect(client.query).toHaveBeenCalledWith('COMMIT');
      expect(client.release).toHaveBeenCalled();
      expect(result).toBe(debitTx);
    });

    it('throws WalletNotFoundError and executes ROLLBACK when lock returns null', async () => {
      // Arrange
      repo.lockWalletForUpdate.mockResolvedValue(null);

      // Act & Assert
      await expect(service.debitWallet(debitParams)).rejects.toThrow(
        WalletNotFoundError,
      );
      expect(client.query).toHaveBeenCalledWith('ROLLBACK');
      expect(repo.debitBalanceAndReturnNew).not.toHaveBeenCalled();
    });

    it('propagates InsufficientBalanceError and executes ROLLBACK', async () => {
      // Arrange
      repo.lockWalletForUpdate.mockResolvedValue(mockWallet);
      repo.debitBalanceAndReturnNew.mockRejectedValue(
        new InsufficientBalanceError(1),
      );

      // Act & Assert
      await expect(service.debitWallet(debitParams)).rejects.toThrow(
        InsufficientBalanceError,
      );
      expect(client.query).toHaveBeenCalledWith('ROLLBACK');
      expect(client.release).toHaveBeenCalled();
    });

    it('handles idempotency: 23505 → ROLLBACK and returns existing transaction', async () => {
      // Arrange
      const existingTx: WalletTransaction = { ...debitTx, id: 88 };
      repo.lockWalletForUpdate.mockResolvedValue(mockWallet);
      repo.debitBalanceAndReturnNew.mockResolvedValue(70);
      repo.insertDebitTransaction.mockRejectedValueOnce({ code: '23505' });
      repo.findTransactionByIdempotencyKey.mockResolvedValue(existingTx);

      // Act
      const result = await service.debitWallet(debitParams);

      // Assert
      expect(client.query).toHaveBeenCalledWith('ROLLBACK');
      expect(repo.findTransactionByIdempotencyKey).toHaveBeenCalledWith(
        debitParams.idempotencyKey,
        client,
      );
      expect(result).toBe(existingTx);
    });

    it('throws WalletNotFoundError when idempotency key exists but transaction fetch returns null', async () => {
      // Arrange
      repo.lockWalletForUpdate.mockResolvedValue(mockWallet);
      repo.debitBalanceAndReturnNew.mockResolvedValue(70);
      repo.insertDebitTransaction.mockRejectedValueOnce({ code: '23505' });
      repo.findTransactionByIdempotencyKey.mockResolvedValue(null);

      // Act & Assert
      await expect(service.debitWallet(debitParams)).rejects.toThrow(
        WalletNotFoundError,
      );
      expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    });
  });
});
