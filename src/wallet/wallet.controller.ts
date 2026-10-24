import {
  BadRequestException,
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";
import { z } from "zod";
import type { BetterAuthUser } from "../auth/auth.types";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { SessionGuard } from "../auth/session.guard";
import { WalletService } from "./wallet.service";

const depositBodySchema = z.object({
  amountCents: z.number().int().positive(),
});

@Controller("wallets/me")
@UseGuards(SessionGuard, RolesGuard)
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Get("balance")
  @Roles("BIDDER", "AUCTIONEER")
  async getBalance(@Req() req: Request) {
    const user = req.user as BetterAuthUser;
    const balance = await this.walletService.getBalance(user.id);
    return {
      totalCents: balance.totalCents.toString(),
      committedCents: balance.committedCents.toString(),
      availableCents: balance.availableCents.toString(),
    };
  }

  @Post("deposit")
  @Roles("BIDDER")
  async deposit(@Req() req: Request, @Body() body: unknown) {
    const parsed = depositBodySchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());

    const user = req.user as BetterAuthUser;
    const wallet = await this.walletService.getWalletByUserId(user.id);
    const result = await this.walletService.deposit(wallet.id, BigInt(parsed.data.amountCents));
    return {
      totalCents: result.totalCents.toString(),
      committedCents: result.committedCents.toString(),
      availableCents: result.availableCents.toString(),
    };
  }

  @Get("ledger")
  @Roles("BIDDER", "AUCTIONEER")
  async getLedger(
    @Req() req: Request,
    @Query("limit", new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query("cursor") cursor?: string,
  ) {
    const user = req.user as BetterAuthUser;
    const wallet = await this.walletService.getWalletByUserId(user.id);
    const entries = await this.walletService.getLedger(wallet.id, Math.min(limit, 100), cursor);
    return entries.map((e) => ({
      ...e,
      amountCents: e.amountCents.toString(),
    }));
  }
}
