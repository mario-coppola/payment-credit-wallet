import { Module } from '@nestjs/common';
import { WorkerService } from './worker.service';
import { JobRepository } from './jobs/job.repository';
import { SubscriptionActivationService } from './handlers/subscription-activation.service';
import { CreditTopupService } from './handlers/credit-topup.service';
import { CreditTopupRepository } from './handlers/credit-topup.repository';
import { WalletService } from './wallet/wallet.service';
import { WalletRepository } from './wallet/wallet.repository';

@Module({
  controllers: [],
  providers: [
    WorkerService,
    JobRepository,
    SubscriptionActivationService,
    CreditTopupService,
    CreditTopupRepository,
    WalletService,
    WalletRepository,
  ],
})
export class AppModule {}
