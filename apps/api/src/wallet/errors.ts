export function isUniqueViolation(err: unknown): boolean {
  return (
    err !== null &&
    typeof err === 'object' &&
    'code' in err &&
    (err as { code: unknown }).code === '23505'
  );
}

export class WalletInsertFailedError extends Error {
  constructor() {
    super('Wallet insert did not return a row');
    this.name = 'WalletInsertFailedError';
  }
}

export class WalletNotFoundError extends Error {
  constructor(walletId: number) {
    super(`Wallet not found: ${walletId}`);
    this.name = 'WalletNotFoundError';
  }
}

export class InsufficientBalanceError extends Error {
  constructor(walletId: number) {
    super(`Insufficient balance in wallet: ${walletId}`);
    this.name = 'InsufficientBalanceError';
  }
}
