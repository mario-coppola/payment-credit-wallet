export interface CreateCheckoutSessionParams {
  userId: string;
  priceId: string;
  creditsToAdd: number;
}

export interface CreateCheckoutSessionResult {
  url: string;
  sessionId: string;
}
