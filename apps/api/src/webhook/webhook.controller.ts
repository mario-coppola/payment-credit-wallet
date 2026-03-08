import {
  Controller,
  Post,
  Body,
  Headers,
  HttpCode,
  BadRequestException,
} from '@nestjs/common';
import Stripe from 'stripe';
import { WebhookService } from './webhook.service';

@Controller('stripe')
export class WebhookController {
  private readonly stripe: Stripe;

  constructor(private readonly webhookService: WebhookService) {
    this.stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);
  }

  @HttpCode(200)
  @Post('webhook')
  async handleWebhook(
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

    await this.webhookService.ingestCheckoutEvent(event);

    return { received: true };
  }
}
