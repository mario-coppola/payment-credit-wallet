import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import Stripe from 'stripe';
import { WebhookController } from './webhook.controller';
import { WebhookService } from './webhook.service';

jest.mock('stripe');

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockEvent = {
  type: 'checkout.session.completed',
  id: 'evt_123',
} as Stripe.Event;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WebhookController', () => {
  let controller: WebhookController;
  let webhookService: jest.Mocked<Pick<WebhookService, 'ingestCheckoutEvent'>>;
  let mockConstructEvent: jest.Mock;

  beforeEach(async () => {
    mockConstructEvent = jest.fn();
    (Stripe as jest.MockedClass<typeof Stripe>).mockImplementation(
      () =>
        ({
          webhooks: {
            constructEvent: mockConstructEvent,
          },
        }) as unknown as Stripe,
    );

    webhookService = {
      ingestCheckoutEvent: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [WebhookController],
      providers: [{ provide: WebhookService, useValue: webhookService }],
    }).compile();

    controller = moduleRef.get(WebhookController);
  });

  // -------------------------------------------------------------------------
  // POST /stripe/webhook
  // -------------------------------------------------------------------------

  describe('handleWebhook', () => {
    const rawBody = Buffer.from('{}');
    const signature = 'stripe-sig';

    it('returns { received: true } on valid checkout.session.completed', async () => {
      // Arrange
      mockConstructEvent.mockReturnValue(mockEvent);
      (webhookService.ingestCheckoutEvent as jest.Mock).mockResolvedValue(
        undefined,
      );

      // Act
      const result = await controller.handleWebhook(rawBody, signature);

      // Assert
      expect(result).toEqual({ received: true });
      expect(webhookService.ingestCheckoutEvent).toHaveBeenCalledWith(
        mockEvent,
      );
    });

    it('returns { received: true } and skips ingestCheckoutEvent for unknown event type', async () => {
      // Arrange
      mockConstructEvent.mockReturnValue({
        ...mockEvent,
        type: 'payment_intent.created',
      });

      // Act
      const result = await controller.handleWebhook(rawBody, signature);

      // Assert
      expect(result).toEqual({ received: true });
      expect(webhookService.ingestCheckoutEvent).not.toHaveBeenCalled();
    });

    it('throws BadRequestException on invalid signature', async () => {
      // Arrange
      mockConstructEvent.mockImplementation(() => {
        throw new Error('Invalid signature');
      });

      // Act & Assert
      await expect(
        controller.handleWebhook(rawBody, signature),
      ).rejects.toThrow(BadRequestException);
      expect(webhookService.ingestCheckoutEvent).not.toHaveBeenCalled();
    });
  });
});
