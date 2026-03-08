import {
  Controller,
  Post,
  Body,
  Headers,
  HttpCode,
  BadRequestException,
} from '@nestjs/common';
import Stripe from 'stripe';
import { logger } from '@pkg/shared';

@Controller('stripe')
export class WebhookController {
  private readonly stripe: Stripe;

  constructor() {
    this.stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);
  }

  @HttpCode(200)
  @Post('webhook')
  handleWebhook(
    @Body() rawBody: Buffer,
    @Headers('stripe-signature') signature: string,
  ) {
    const secret = process.env.STRIPE_WEBHOOK_SECRET as string;

    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(rawBody, signature, secret);
    } catch {
      throw new BadRequestException('Invalid webhook signature');
    }

    if (event.type !== 'checkout.session.completed') {
      return { received: true };
    }

    logger.info(
      { service: 'api', event_type: event.type, event_id: event.id },
      'stripe webhook received',
    );

    return { received: true };
  }
}
