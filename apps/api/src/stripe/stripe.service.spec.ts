import Stripe from 'stripe';
import { StripeService } from './stripe.service';
import { CheckoutSessionCreationError } from './errors';

jest.mock('stripe');

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockSession = {
  id: 'cs_test_123',
  url: 'https://checkout.stripe.com/test',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('StripeService', () => {
  let service: StripeService;
  let mockSessionsCreate: jest.Mock;

  beforeEach(() => {
    mockSessionsCreate = jest.fn();
    (Stripe as jest.MockedClass<typeof Stripe>).mockImplementation(
      () =>
        ({
          checkout: {
            sessions: {
              create: mockSessionsCreate,
            },
          },
        }) as unknown as Stripe,
    );

    service = new StripeService();
  });

  // -------------------------------------------------------------------------
  // createCheckoutSession
  // -------------------------------------------------------------------------

  describe('createCheckoutSession', () => {
    const params = {
      userId: 'user-123',
      priceId: 'price_abc',
      creditsToAdd: 100,
    };

    it('returns url and sessionId on success', async () => {
      // Arrange
      mockSessionsCreate.mockResolvedValue(mockSession);

      // Act
      const result = await service.createCheckoutSession(params);

      // Assert
      expect(result).toEqual({
        url: mockSession.url,
        sessionId: mockSession.id,
      });
      const expectedMetadata: Record<string, string> = {
        user_id: params.userId,
        credits_to_add: String(params.creditsToAdd),
      };
      expect(mockSessionsCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: 'payment',
          metadata: expectedMetadata,
        }),
      );
    });

    it('throws CheckoutSessionCreationError when session url is null', async () => {
      // Arrange
      mockSessionsCreate.mockResolvedValue({ ...mockSession, url: null });

      // Act & Assert
      await expect(service.createCheckoutSession(params)).rejects.toThrow(
        CheckoutSessionCreationError,
      );
    });
  });
});
