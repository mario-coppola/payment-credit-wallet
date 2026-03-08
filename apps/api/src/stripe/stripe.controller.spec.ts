import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { StripeController } from './stripe.controller';
import { StripeService } from './stripe.service';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('StripeController', () => {
  let controller: StripeController;
  let stripeService: jest.Mocked<Pick<StripeService, 'createCheckoutSession'>>;

  beforeEach(async () => {
    stripeService = {
      createCheckoutSession: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [StripeController],
      providers: [{ provide: StripeService, useValue: stripeService }],
    }).compile();

    controller = moduleRef.get(StripeController);
  });

  // -------------------------------------------------------------------------
  // POST /checkout/session
  // -------------------------------------------------------------------------

  describe('createCheckoutSession', () => {
    it('returns url and sessionId on valid body', async () => {
      // Arrange
      const body = {
        userId: 'user-123',
        priceId: 'price_abc',
        creditsToAdd: 100,
      };
      const serviceResult = {
        url: 'https://checkout.stripe.com/test',
        sessionId: 'cs_test_123',
      };
      stripeService.createCheckoutSession.mockResolvedValue(serviceResult);

      // Act
      const result = await controller.createCheckoutSession(body);

      // Assert
      expect(stripeService.createCheckoutSession).toHaveBeenCalledWith(body);
      expect(result).toBe(serviceResult);
    });

    it('throws BadRequestException on invalid body', async () => {
      // Arrange
      const body = { userId: 'user-123', priceId: 'price_abc' };

      // Act & Assert
      await expect(controller.createCheckoutSession(body)).rejects.toThrow(
        BadRequestException,
      );
      expect(stripeService.createCheckoutSession).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when creditsToAdd is not a positive integer', async () => {
      // Arrange
      const body = {
        userId: 'user-123',
        priceId: 'price_abc',
        creditsToAdd: -5,
      };

      // Act & Assert
      await expect(controller.createCheckoutSession(body)).rejects.toThrow(
        BadRequestException,
      );
      expect(stripeService.createCheckoutSession).not.toHaveBeenCalled();
    });
  });
});
