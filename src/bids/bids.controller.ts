import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Req,
  Res,
  UseGuards,
  BadRequestException,
  Sse,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { Observable, Subject } from "rxjs";
import { z } from "zod";
import { SessionGuard } from "../auth/session.guard";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { BidsService } from "./bids.service";
import { WalletService } from "../wallet/wallet.service";
import type { BetterAuthUser } from "../auth/auth.types";

const placeBidSchema = z.object({
  amountCents: z.number().int().positive(),
});

interface BidEvent {
  data: string;
}

const lotSubjects = new Map<string, Subject<BidEvent>>();

function getOrCreateSubject(lotId: string): Subject<BidEvent> {
  let subj = lotSubjects.get(lotId);
  if (!subj) {
    subj = new Subject<BidEvent>();
    lotSubjects.set(lotId, subj);
  }
  return subj;
}

export function emitBidEvent(lotId: string, payload: Record<string, unknown>): void {
  lotSubjects.get(lotId)?.next({ data: JSON.stringify(payload) });
}

@Controller("lots/:lotId/bids")
export class BidsController {
  constructor(
    private readonly bidsService: BidsService,
    private readonly walletService: WalletService,
  ) {}

  @Post()
  @UseGuards(SessionGuard, RolesGuard)
  @Roles("BIDDER")
  async placeBid(
    @Param("lotId") lotId: string,
    @Req() req: Request,
    @Body() body: unknown,
  ) {
    const parsed = placeBidSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());

    const user = req.user as BetterAuthUser;
    const wallet = await this.walletService.getWalletByUserId(user.id);

    const bid = await this.bidsService.placeBid({
      lotId,
      bidderId: user.id,
      walletId: wallet.id,
      amountCents: BigInt(parsed.data.amountCents),
    });

    const payload = {
      bidId: bid.id,
      lotId,
      amountCents: bid.amountCents.toString(),
      sequence: bid.sequence,
      placedAt: bid.placedAt,
    };
    emitBidEvent(lotId, payload);

    return payload;
  }

  @Get()
  async getBids(@Param("lotId") lotId: string) {
    const bids = await this.bidsService.getBidsForLot(lotId);
    return bids.map((b) => ({
      id: b.id,
      sequence: b.sequence,
      amountCents: b.amountCents.toString(),
      placedAt: b.placedAt,
      pseudonym: this.bidsService.getPseudonym(b.bidderId),
    }));
  }

  @Sse("events")
  streamBids(@Param("lotId") lotId: string): Observable<BidEvent> {
    return getOrCreateSubject(lotId).asObservable();
  }
}
