import { Module } from '@nestjs/common';
import { WalletRepository } from './wallet.repository';
import { WalletService } from './wallet.service';

@Module({
  providers: [WalletRepository, WalletService],
  exports: [WalletService],
})
export class WalletModule {}
