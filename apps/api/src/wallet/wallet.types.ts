export interface Wallet {
  id: number;
  user_id: string;
  balance: number;
  created_at: Date;
  updated_at: Date;
}

export interface WalletTransaction {
  id: number;
  wallet_id: number;
  type: 'credit' | 'debit';
  amount: number;
  balance_after: number;
  idempotency_key: string;
  reference_id: string | null;
  reference_type: string | null;
  metadata: Record<string, unknown> | null;
  created_at: Date;
}

export interface CreditParams {
  walletId: number;
  amount: number;
  idempotencyKey: string;
  referenceId?: string;
  referenceType?: string;
  metadata?: Record<string, unknown>;
}
