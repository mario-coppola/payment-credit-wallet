import { CreditTopupRepository } from './credit-topup.repository';
import type { PoolClient } from 'pg';

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

function makeClientMock() {
  return {
    query: jest.fn().mockResolvedValue({}),
  } as unknown as jest.Mocked<Pick<PoolClient, 'query'>>;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CreditTopupRepository', () => {
  let repo: CreditTopupRepository;
  let client: ReturnType<typeof makeClientMock>;

  beforeEach(() => {
    client = makeClientMock();
    repo = new CreditTopupRepository();
  });

  describe('insertPending', () => {
    it('executes correct SQL with all parameters', async () => {
      // Act
      await repo.insertPending(
        client as unknown as PoolClient,
        'credit_topup:pi_abc',
        'pi_abc',
        7,
        2000,
        200,
      );

      // Assert
      expect(client.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO credit_topups'),
        ['credit_topup:pi_abc', 'pi_abc', 7, 2000, 200],
      );
    });
  });

  describe('markSucceeded', () => {
    it('executes correct SQL with idempotencyKey', async () => {
      // Act
      await repo.markSucceeded(
        client as unknown as PoolClient,
        'credit_topup:pi_abc',
      );

      // Assert
      expect(client.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE credit_topups'),
        ['credit_topup:pi_abc'],
      );
    });
  });
});
