import { Injectable, BadRequestException } from "@nestjs/common";
import type { Bid } from "@prisma/client";
import { createHmac } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";
import { WalletService } from "../wallet/wallet.service";
import { hashBid } from "./bid-chain";

const ANTI_SNIPE_WINDOW_MS = 2 * 60 * 1000;

export interface PlaceBidInput {
  lotId: string;
  bidderId: string;
  walletId: string;
  amountCents: bigint;
}

function signBid(hash: string, signingKey: string): string {
  return createHmac("sha256", signingKey).update(hash).digest("hex");
}

@Injectable()
export class BidsService {
  private readonly signingKey: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly walletService: WalletService,
  ) {
    this.signingKey = process.env["AUDIT_SIGNING_KEY"] ?? "";
  }

  async placeBid(input: PlaceBidInput): Promise<Bid> {
    return this.prisma.$transaction(async (tx) => {
      const lot = await tx.lot.findUnique({ where: { id: input.lotId } });
      const now = new Date();

      if (!lot || lot.status !== "LIVE" || lot.endsAt <= now) {
        throw new BadRequestException("LOT_NOT_LIVE");
      }

      const minBid = lot.currentBidCents !== null
        ? lot.currentBidCents + lot.minIncrementCents
        : lot.startingBidCents;

      if (input.amountCents < minBid) {
        throw new BadRequestException("BID_TOO_LOW");
      }

      const prevHash = lot.chainHeadHash ?? "genesis";
      const sequence = lot.bidCount + 1;

      const hash = hashBid({
        lotId: input.lotId,
        bidId: `${input.lotId}-${sequence}`,
        bidderId: input.bidderId,
        amountCents: input.amountCents,
        prevHash: lot.chainHeadHash,
      });

      const signature = signBid(hash, this.signingKey);

      const bid = await tx.bid.create({
        data: {
          lotId: input.lotId,
          bidderId: input.bidderId,
          sequence,
          amountCents: input.amountCents,
          previousHash: prevHash,
          hash,
          signature,
        },
      });

      const antiSnipeExtension =
        lot.endsAt.getTime() - now.getTime() < ANTI_SNIPE_WINDOW_MS
          ? new Date(now.getTime() + ANTI_SNIPE_WINDOW_MS)
          : lot.endsAt;

      await tx.lot.update({
        where: { id: input.lotId },
        data: {
          currentBidCents: input.amountCents,
          leadingBidderId: input.bidderId,
          chainHeadHash: hash,
          chainHeadSignature: signature,
          bidCount: { increment: 1 },
          endsAt: antiSnipeExtension,
        },
      });

      return bid;
    });
  }

  async getBidsForLot(lotId: string): Promise<Bid[]> {
    return this.prisma.bid.findMany({
      where: { lotId },
      orderBy: { sequence: "asc" },
    });
  }
}
