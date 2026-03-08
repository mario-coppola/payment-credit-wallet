export class CheckoutSessionCreationError extends Error {
  constructor() {
    super('Checkout session creation failed: session URL is null');
    this.name = 'CheckoutSessionCreationError';
  }
}
