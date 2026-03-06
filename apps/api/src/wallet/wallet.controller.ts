import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
} from '@nestjs/common';
import { WalletService } from './wallet.service';
import { WalletNotFoundError } from './errors';

@Controller('wallets')
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Get(':userId')
  async getWallet(@Param('userId') userId: string) {
    try {
      return await this.walletService.getWallet(userId);
    } catch (err: unknown) {
      if (err instanceof WalletNotFoundError) {
        throw new NotFoundException(`Wallet not found for user: ${userId}`);
      }
      throw err;
    }
  }

  @Get(':userId/transactions')
  async getTransactions(
    @Param('userId') userId: string,
    @Query('limit') limitParam?: string,
    @Query('offset') offsetParam?: string,
  ) {
    const limit = Math.min(Number(limitParam) || 20, 100);
    const offset = Math.max(Number(offsetParam) || 0, 0);

    try {
      return await this.walletService.getTransactions(userId, limit, offset);
    } catch (err: unknown) {
      if (err instanceof WalletNotFoundError) {
        throw new NotFoundException(`Wallet not found for user: ${userId}`);
      }
      throw err;
    }
  }
}
