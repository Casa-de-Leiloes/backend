import { createHmac } from "node:crypto";
import { BadRequestException, Injectable } from "@nestjs/common";
import type { Bid } from "@prisma/client";
import type { PrismaService } from "../prisma/prisma.service";
import type { WalletService } from "../wallet/wallet.service";
import { hashBid } from "./bid-chain";

const ADJECTIVES = [
  "Swift",
  "Bold",
  "Sharp",
  "Quiet",
  "Brave",
  "Calm",
  "Deft",
  "Keen",
  "Wise",
  "Warm",
];
const ANIMALS = [
  "Falcon",
  "Lynx",
  "Otter",
  "Raven",
  "Wolf",
  "Crane",
  "Bear",
  "Hawk",
  "Fox",
  "Stag",
];

function derivePseudonym(bidderId: string, pseudonymKey: string): string {
  const hash = createHmac("sha256", pseudonymKey).update(bidderId).digest();
  const adj = ADJECTIVES[hash[0]! % ADJECTIVES.length]!;
  const animal = ANIMALS[hash[1]! % ANIMALS.length]!;
  const num = (hash[2]! * 256 + hash[3]!) % 1000;
  return `${adj}${animal}${num}`;
}

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
    readonly _walletService: WalletService,
  ) {
    this.signingKey = process.env.AUDIT_SIGNING_KEY ?? "";
  }

  async placeBid(input: PlaceBidInput): Promise<Bid> {
    return this.prisma.$transaction(async (tx) => {
      const lot = await tx.lot.findUnique({ where: { id: input.lotId } });
      const now = new Date();

      if (lot?.status !== "LIVE" || lot.endsAt <= now) {
        throw new BadRequestException("LOT_NOT_LIVE");
      }

      const minBid =
        lot.currentBidCents !== null
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

  getPseudonym(bidderId: string): string {
    const key = process.env.PSEUDONYM_KEY ?? "";
    return derivePseudonym(bidderId, key);
  }

  async getMyBids(
    bidderId: string,
    cursor?: string,
    limit = 20,
  ): Promise<{ items: Bid[]; nextCursor: string | null }> {
    const items = await this.prisma.bid.findMany({
      where: { bidderId },
      orderBy: { placedAt: "desc" },
      take: limit + 1,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    const hasNext = items.length > limit;
    if (hasNext) items.pop();
    return { items, nextCursor: hasNext ? (items[items.length - 1]?.id ?? null) : null };
  }

  async getMyWins(
    bidderId: string,
  ): Promise<Array<{ lotId: string; amountCents: bigint; receiptToken: string | null }>> {
    const receipts = await this.prisma.receipt.findMany({
      where: { winnerId: bidderId },
      orderBy: { issuedAt: "desc" },
    });
    return receipts.map((r) => ({
      lotId: r.lotId,
      amountCents: r.amountCents,
      receiptToken: r.publicToken,
    }));
  }
}
