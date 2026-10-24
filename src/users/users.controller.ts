import {
  Controller,
  DefaultValuePipe,
  Get,
  ParseIntPipe,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";
import type { BetterAuthUser } from "../auth/auth.types";
import type { IdentityService } from "../auth/identity.service";
import { SessionGuard } from "../auth/session.guard";
import type { BidsService } from "../bids/bids.service";
import type { PrismaService } from "../prisma/prisma.service";

@Controller("users/me")
@UseGuards(SessionGuard)
export class UsersController {
  constructor(
    private readonly bidsService: BidsService,
    private readonly identityService: IdentityService,
    private readonly prisma: PrismaService,
  ) {}

  @Get("bids")
  async myBids(
    @Req() req: Request,
    @Query("cursor") cursor?: string,
    @Query("limit", new DefaultValuePipe(20), ParseIntPipe) limit = 20,
  ) {
    const user = req.user as BetterAuthUser;
    const page = await this.bidsService.getMyBids(user.id, cursor, Math.min(limit, 100));
    return {
      items: page.items.map((b) => ({
        id: b.id,
        lotId: b.lotId,
        amountCents: b.amountCents.toString(),
        sequence: b.sequence,
        placedAt: b.placedAt,
      })),
      nextCursor: page.nextCursor,
    };
  }

  @Get("wins")
  async myWins(@Req() req: Request) {
    const user = req.user as BetterAuthUser;
    const wins = await this.bidsService.getMyWins(user.id);
    return wins.map((w) => ({
      lotId: w.lotId,
      amountCents: w.amountCents.toString(),
      receiptToken: w.receiptToken,
    }));
  }

  @Get("export")
  async lgpdExport(@Req() req: Request) {
    const user = req.user as BetterAuthUser;

    const dbUser = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    const wallet = await this.prisma.wallet.findUnique({ where: { userId: user.id } });
    const bids = await this.bidsService.getMyBids(user.id, undefined, 1000);
    const wins = await this.bidsService.getMyWins(user.id);

    let decryptedEmail: string | null = null;
    let decryptedName: string | null = null;
    try {
      if (dbUser.encryptedEmail)
        decryptedEmail = this.identityService.decrypt(dbUser.encryptedEmail);
      if (dbUser.encryptedFullName)
        decryptedName = this.identityService.decrypt(dbUser.encryptedFullName);
    } catch {
      // key rotation edge case — return what we can
    }

    return {
      exportedAt: new Date().toISOString(),
      profile: {
        id: dbUser.id,
        email: decryptedEmail,
        name: decryptedName,
        role: dbUser.role,
        createdAt: dbUser.createdAt,
      },
      wallet: wallet
        ? {
            totalCents: wallet.totalCents.toString(),
            committedCents: wallet.committedCents.toString(),
          }
        : null,
      bids: bids.items.map((b) => ({
        id: b.id,
        lotId: b.lotId,
        amountCents: b.amountCents.toString(),
        placedAt: b.placedAt,
      })),
      wins: wins.map((w) => ({ lotId: w.lotId, amountCents: w.amountCents.toString() })),
    };
  }
}
