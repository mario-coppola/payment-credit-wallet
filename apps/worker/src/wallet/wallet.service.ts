import { Injectable } from '@nestjs/common';
import { logger } from '@pkg/shared';
import { db } from '../db';
import { WalletRepository } from './wallet.repository';
import type {
  Wallet,
  WalletTransaction,
  CreditParams,
  DebitParams,
} from './wallet.types';
import { WalletNotFoundError, isUniqueViolation } from './errors';

@Injectable()
export class WalletService {
  constructor(private readonly walletRepository: WalletRepository) {}

  async getWallet(userId: string): Promise<Wallet> {
    const wallet = await this.walletRepository.findByUserId(userId);
    if (!wallet) {
      throw new WalletNotFoundError(userId);
    }
    return wallet;
  }

  async getTransactions(
    userId: string,
    limit: number,
    offset: number,
  ): Promise<WalletTransaction[]> {
    const wallet = await this.walletRepository.findByUserId(userId);
    if (!wallet) {
      throw new WalletNotFoundError(userId);
    }
    return this.walletRepository.findTransactionsByWalletId(
      wallet.id,
      limit,
      offset,
    );
  }

  async getOrCreateWallet(userId: string): Promise<Wallet> {
    const existing = await this.walletRepository.findByUserId(userId);
    if (existing) return existing;

    try {
      return await this.walletRepository.createWallet(userId);
    } catch (err: unknown) {
      if (isUniqueViolation(err)) {
        const wallet = await this.walletRepository.findByUserId(userId);
        if (wallet) return wallet;
      }
      throw err;
    }
  }

  async debitWallet(params: DebitParams): Promise<WalletTransaction> {
    const { walletId, idempotencyKey } = params;

    const client = await db.connect();
    try {
      await client.query('BEGIN');

      try {
        const wallet = await this.walletRepository.lockWalletForUpdate(
          walletId,
          client,
        );
        if (!wallet) {
          throw new WalletNotFoundError(walletId);
        }

        const balanceAfter =
          await this.walletRepository.debitBalanceAndReturnNew(
            walletId,
            params.amount,
            client,
          );

        const tx = await this.walletRepository.insertDebitTransaction(
          params,
          balanceAfter,
          client,
        );

        await client.query('COMMIT');

        logger.info(
          {
            service: 'api',
            wallet_id: walletId,
            amount: params.amount,
            idempotency_key: idempotencyKey,
            transaction_id: tx.id,
          },
          'wallet debited',
        );

        return tx;
      } catch (err: unknown) {
        if (isUniqueViolation(err)) {
          try {
            await client.query('ROLLBACK');
          } catch {
            // ignore rollback errors
          }

          logger.info(
            {
              service: 'api',
              wallet_id: walletId,
              idempotency_key: idempotencyKey,
            },
            'duplicate debit, skipping',
          );

          const existing =
            await this.walletRepository.findTransactionByIdempotencyKey(
              idempotencyKey,
              client,
            );
          if (!existing) {
            throw new WalletNotFoundError(walletId);
          }
          return existing;
        }

        try {
          await client.query('ROLLBACK');
        } catch {
          // ignore rollback errors
        }

        throw err;
      }
    } finally {
      client.release();
    }
  }

  async creditWallet(params: CreditParams): Promise<WalletTransaction> {
    const { walletId, idempotencyKey } = params;

    const client = await db.connect();
    try {
      await client.query('BEGIN');

      try {
        const balanceAfter =
          await this.walletRepository.updateBalanceAndReturnNew(
            walletId,
            params.amount,
            client,
          );

        const tx = await this.walletRepository.insertTransaction(
          params,
          balanceAfter,
          client,
        );

        await client.query('COMMIT');

        logger.info(
          {
            service: 'api',
            wallet_id: walletId,
            amount: params.amount,
            idempotency_key: idempotencyKey,
            transaction_id: tx.id,
          },
          'wallet credited',
        );

        return tx;
      } catch (err: unknown) {
        if (isUniqueViolation(err)) {
          try {
            await client.query('ROLLBACK');
          } catch {
            // ignore rollback errors
          }

          logger.info(
            {
              service: 'api',
              wallet_id: walletId,
              idempotency_key: idempotencyKey,
            },
            'duplicate credit, skipping',
          );

          const existing =
            await this.walletRepository.findTransactionByIdempotencyKey(
              idempotencyKey,
              client,
            );
          if (!existing) {
            throw new WalletNotFoundError(walletId);
          }
          return existing;
        }

        try {
          await client.query('ROLLBACK');
        } catch {
          // ignore rollback errors
        }

        throw err;
      }
    } finally {
      client.release();
    }
  }
}
