import {
  isUniqueViolation,
  WalletNotFoundError,
  InsufficientBalanceError,
  WalletInsertFailedError,
} from './errors';

describe('isUniqueViolation', () => {
  it('returns false for null', () => {
    expect(isUniqueViolation(null)).toBe(false);
  });

  it('returns false for empty object', () => {
    expect(isUniqueViolation({})).toBe(false);
  });

  it('returns true for { code: "23505" }', () => {
    expect(isUniqueViolation({ code: '23505' })).toBe(true);
  });

  it('returns false for a different pg error code', () => {
    expect(isUniqueViolation({ code: '23000' })).toBe(false);
  });
});

describe('WalletNotFoundError', () => {
  it('has correct name and message for numeric walletId', () => {
    const err = new WalletNotFoundError(42);
    expect(err.name).toBe('WalletNotFoundError');
    expect(err.message).toContain('42');
  });

  it('has correct name and message for string userId', () => {
    const err = new WalletNotFoundError('user-abc');
    expect(err.name).toBe('WalletNotFoundError');
    expect(err.message).toContain('user-abc');
  });
});

describe('InsufficientBalanceError', () => {
  it('has correct name and message containing walletId', () => {
    const err = new InsufficientBalanceError(7);
    expect(err.name).toBe('InsufficientBalanceError');
    expect(err.message).toContain('7');
  });
});

describe('WalletInsertFailedError', () => {
  it('has correct name', () => {
    const err = new WalletInsertFailedError();
    expect(err.name).toBe('WalletInsertFailedError');
  });
});
