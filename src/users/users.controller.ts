import { Controller, Get, Query, Req, UseGuards, ParseIntPipe, DefaultValuePipe } from "@nestjs/common";
import type { Request } from "express";
import { SessionGuard } from "../auth/session.guard";
import { BidsService } from "../bids/bids.service";
import type { BetterAuthUser } from "../auth/auth.types";

@Controller("users/me")
@UseGuards(SessionGuard)
export class UsersController {
  constructor(private readonly bidsService: BidsService) {}

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
}
