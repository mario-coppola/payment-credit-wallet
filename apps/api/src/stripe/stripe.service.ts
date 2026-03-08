import { Injectable } from '@nestjs/common';
import Stripe from 'stripe';
import { CheckoutSessionCreationError } from './errors';
import type {
  CreateCheckoutSessionParams,
  CreateCheckoutSessionResult,
} from './stripe.types';

@Injectable()
export class StripeService {
  private readonly stripe: Stripe;

  constructor() {
    this.stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);
  }

  async createCheckoutSession(
    params: CreateCheckoutSessionParams,
  ): Promise<CreateCheckoutSessionResult> {
    const session = await this.stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{ price: params.priceId, quantity: 1 }],
      metadata: {
        user_id: params.userId,
        credits_to_add: String(params.creditsToAdd),
      },
      success_url: process.env.STRIPE_SUCCESS_URL,
      cancel_url: process.env.STRIPE_CANCEL_URL,
    });

    if (session.url === null) {
      throw new CheckoutSessionCreationError();
    }

    return { url: session.url, sessionId: session.id };
  }
}
