import { Injectable } from '@nestjs/common';
import { logger } from '@pkg/shared';
import type { PoolClient } from 'pg';
import { db } from '../db';
import type { Wallet, WalletTransaction, CreditParams, DebitParams } from './wallet.types';
import { WalletInsertFailedError, WalletNotFoundError, InsufficientBalanceError } from './errors';

@Injectable()
export class WalletRepository {
  async createWallet(userId: string): Promise<Wallet> {
    const res = await db.query<Wallet>(
      `
      INSERT INTO wallets (user_id, balance)
      VALUES ($1, 0)
      RETURNING id, user_id, balance, created_at, updated_at
      `,
      [userId],
    );

    const wallet = res.rows[0];
    if (!wallet) {
      throw new WalletInsertFailedError();
    }

    logger.info(
      { service: 'api', user_id: userId, wallet_id: wallet.id },
      'wallet created',
    );

    return wallet;
  }

  async findByUserId(userId: string): Promise<Wallet | null> {
    const res = await db.query<Wallet>(
      `
      SELECT id, user_id, balance, created_at, updated_at
      FROM wallets
      WHERE user_id = $1
      `,
      [userId],
    );

    return res.rows[0] ?? null;
  }

  async findById(walletId: number): Promise<Wallet | null> {
    const res = await db.query<Wallet>(
      `
      SELECT id, user_id, balance, created_at, updated_at
      FROM wallets
      WHERE id = $1
      `,
      [walletId],
    );

    return res.rows[0] ?? null;
  }

  async findTransactionByIdempotencyKey(
    key: string,
    client: PoolClient,
  ): Promise<WalletTransaction | null> {
    const res = await client.query<WalletTransaction>(
      `
      SELECT id, wallet_id, type, amount, balance_after, idempotency_key,
             reference_id, reference_type, metadata, created_at
      FROM wallet_transactions
      WHERE idempotency_key = $1
      `,
      [key],
    );

    return res.rows[0] ?? null;
  }

  async updateBalanceAndReturnNew(
    walletId: number,
    amount: number,
    client: PoolClient,
  ): Promise<number> {
    const res = await client.query<{ balance: number }>(
      `
      UPDATE wallets
      SET balance = balance + $1, updated_at = NOW()
      WHERE id = $2
      RETURNING balance
      `,
      [amount, walletId],
    );

    if ((res.rowCount ?? 0) === 0) {
      throw new WalletNotFoundError(walletId);
    }

    return res.rows[0].balance;
  }

  async lockWalletForUpdate(
    walletId: number,
    client: PoolClient,
  ): Promise<Wallet | null> {
    const res = await client.query<Wallet>(
      `
      SELECT id, user_id, balance
      FROM wallets
      WHERE id = $1
      FOR UPDATE
      `,
      [walletId],
    );

    return res.rows[0] ?? null;
  }

  async debitBalanceAndReturnNew(
    walletId: number,
    amount: number,
    client: PoolClient,
  ): Promise<number> {
    const res = await client.query<{ balance: number }>(
      `
      UPDATE wallets
      SET balance = balance - $1, updated_at = NOW()
      WHERE id = $2 AND balance >= $1
      RETURNING balance
      `,
      [amount, walletId],
    );

    if ((res.rowCount ?? 0) === 0) {
      throw new InsufficientBalanceError(walletId);
    }

    return res.rows[0].balance;
  }

  async insertDebitTransaction(
    params: DebitParams,
    balanceAfter: number,
    client: PoolClient,
  ): Promise<WalletTransaction> {
    const { walletId, amount, idempotencyKey, referenceId, referenceType, metadata } = params;

    const res = await client.query<WalletTransaction>(
      `
      INSERT INTO wallet_transactions
        (wallet_id, type, amount, balance_after, idempotency_key, reference_id, reference_type, metadata)
      VALUES ($1, 'debit', $2, $3, $4, $5, $6, $7::jsonb)
      RETURNING id, wallet_id, type, amount, balance_after, idempotency_key,
                reference_id, reference_type, metadata, created_at
      `,
      [
        walletId,
        amount,
        balanceAfter,
        idempotencyKey,
        referenceId ?? null,
        referenceType ?? null,
        metadata ? JSON.stringify(metadata) : null,
      ],
    );

    return res.rows[0];
  }

  async insertTransaction(
    params: CreditParams,
    balanceAfter: number,
    client: PoolClient,
  ): Promise<WalletTransaction> {
    const { walletId, amount, idempotencyKey, referenceId, referenceType, metadata } = params;

    const res = await client.query<WalletTransaction>(
      `
      INSERT INTO wallet_transactions
        (wallet_id, type, amount, balance_after, idempotency_key, reference_id, reference_type, metadata)
      VALUES ($1, 'credit', $2, $3, $4, $5, $6, $7::jsonb)
      RETURNING id, wallet_id, type, amount, balance_after, idempotency_key,
                reference_id, reference_type, metadata, created_at
      `,
      [
        walletId,
        amount,
        balanceAfter,
        idempotencyKey,
        referenceId ?? null,
        referenceType ?? null,
        metadata ? JSON.stringify(metadata) : null,
      ],
    );

    return res.rows[0];
  }
}
