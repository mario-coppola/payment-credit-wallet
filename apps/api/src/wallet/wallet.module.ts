import { Module } from '@nestjs/common';
import { WalletController } from './wallet.controller';
import { WalletRepository } from './wallet.repository';
import { WalletService } from './wallet.service';

@Module({
  controllers: [WalletController],
  providers: [WalletRepository, WalletService],
  exports: [WalletService],
})
export class WalletModule {}
