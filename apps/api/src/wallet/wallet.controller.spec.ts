import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { WalletController } from './wallet.controller';
import { WalletService } from './wallet.service';
import { WalletNotFoundError } from './errors';
import type { Wallet, WalletTransaction } from './wallet.types';

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

const mockTransactions: WalletTransaction[] = [
  {
    id: 10,
    wallet_id: 1,
    type: 'credit',
    amount: 50,
    balance_after: 150,
    idempotency_key: 'idem-1',
    reference_id: null,
    reference_type: null,
    metadata: null,
    created_at: new Date('2024-01-01'),
  },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WalletController', () => {
  let controller: WalletController;
  let walletService: jest.Mocked<
    Pick<WalletService, 'getWallet' | 'getTransactions'>
  >;

  beforeEach(async () => {
    walletService = {
      getWallet: jest.fn(),
      getTransactions: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [WalletController],
      providers: [{ provide: WalletService, useValue: walletService }],
    }).compile();

    controller = moduleRef.get(WalletController);
  });

  // -------------------------------------------------------------------------
  // GET :userId
  // -------------------------------------------------------------------------

  describe('getWallet', () => {
    it('returns wallet when service finds it', async () => {
      // Arrange
      walletService.getWallet.mockResolvedValue(mockWallet);

      // Act
      const result = await controller.getWallet('user-123');

      // Assert
      expect(walletService.getWallet).toHaveBeenCalledWith('user-123');
      expect(result).toBe(mockWallet);
    });

    it('throws NotFoundException when service throws WalletNotFoundError', async () => {
      // Arrange
      walletService.getWallet.mockRejectedValue(
        new WalletNotFoundError('user-123'),
      );

      // Act & Assert
      await expect(controller.getWallet('user-123')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // -------------------------------------------------------------------------
  // GET :userId/transactions
  // -------------------------------------------------------------------------

  describe('getTransactions', () => {
    it('calls service with userId and default limit=20, offset=0', async () => {
      // Arrange
      walletService.getTransactions.mockResolvedValue(mockTransactions);

      // Act
      const result = await controller.getTransactions(
        'user-123',
        undefined,
        undefined,
      );

      // Assert
      expect(walletService.getTransactions).toHaveBeenCalledWith(
        'user-123',
        20,
        0,
      );
      expect(result).toBe(mockTransactions);
    });

    it('passes custom limit and offset to service', async () => {
      // Arrange
      walletService.getTransactions.mockResolvedValue(mockTransactions);

      // Act
      await controller.getTransactions('user-123', '50', '10');

      // Assert
      expect(walletService.getTransactions).toHaveBeenCalledWith(
        'user-123',
        50,
        10,
      );
    });

    it('clamps limit to 100 when value exceeds maximum', async () => {
      // Arrange
      walletService.getTransactions.mockResolvedValue([]);

      // Act
      await controller.getTransactions('user-123', '200', undefined);

      // Assert
      expect(walletService.getTransactions).toHaveBeenCalledWith(
        'user-123',
        100,
        0,
      );
    });

    it('clamps negative offset to 0', async () => {
      // Arrange
      walletService.getTransactions.mockResolvedValue([]);

      // Act
      await controller.getTransactions('user-123', undefined, '-5');

      // Assert
      expect(walletService.getTransactions).toHaveBeenCalledWith(
        'user-123',
        20,
        0,
      );
    });

    it('throws NotFoundException when service throws WalletNotFoundError', async () => {
      // Arrange
      walletService.getTransactions.mockRejectedValue(
        new WalletNotFoundError('user-123'),
      );

      // Act & Assert
      await expect(
        controller.getTransactions('user-123', undefined, undefined),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
