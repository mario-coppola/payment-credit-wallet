import { Controller, Post, Body } from '@nestjs/common';
import { StripeService } from './stripe.service';
import { parseOrThrow } from '../validation/parse-or-throw';
import { createCheckoutSessionSchema } from '../validation/schemas';

@Controller('checkout')
export class StripeController {
  constructor(private readonly stripeService: StripeService) {}

  @Post('session')
  async createCheckoutSession(@Body() body: unknown) {
    const params = parseOrThrow(createCheckoutSessionSchema, body);
    return this.stripeService.createCheckoutSession(params);
  }
}
