import { ForbiddenException, Injectable } from "@nestjs/common";
import type { CatalogItemSnapshot, CatalogProvider, Lot, LotStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

export interface CreateLotInput {
  auctioneerId: string;
  snapshotId: string;
  title: string;
  description?: string;
  category: CatalogProvider;
  startingBidCents: bigint;
  minIncrementCents: bigint;
  startsAt: Date;
  endsAt: Date;
}

export type LotWithSnapshot = Lot & { snapshot: CatalogItemSnapshot | null };

export interface LotPage {
  items: LotWithSnapshot[];
  nextCursor: string | null;
}

export interface BidderPosition {
  rank: number | null;
  lastBidCents: bigint | null;
  currentPriceCents: bigint | null;
  gapToLeadCents: bigint | null;
  isLeading: boolean;
}

@Injectable()
export class LotsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateLotInput): Promise<Lot> {
    return this.prisma.lot.create({
      data: {
        auctioneerId: input.auctioneerId,
        snapshotId: input.snapshotId,
        title: input.title,
        description: input.description,
        category: input.category,
        startingBidCents: input.startingBidCents,
        minIncrementCents: input.minIncrementCents,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        originalEndsAt: input.endsAt,
        status: "SCHEDULED",
      },
    });
  }

  async findById(id: string): Promise<Lot> {
    return this.prisma.lot.findUniqueOrThrow({ where: { id } });
  }

  async cancel(lotId: string, requesterId: string): Promise<Lot> {
    return this.prisma.$transaction(async (tx) => {
      const lot = await tx.lot.findUniqueOrThrow({ where: { id: lotId } });

      if (lot.auctioneerId !== requesterId) throw new ForbiddenException("FORBIDDEN_ROLE");
      if (lot.status === "CLOSED" || lot.status === "CANCELLED") {
        throw new ForbiddenException(`LOT_ALREADY_${lot.status}`);
      }

      const uniqueBidders = await tx.bid.groupBy({
        by: ["bidderId"],
        where: { lotId },
        _max: { amountCents: true },
      });

      for (const row of uniqueBidders) {
        const wallet = await tx.wallet.findUnique({ where: { userId: row.bidderId } });
        if (!wallet || !row._max.amountCents) continue;
        const refundAmount = row._max.amountCents;

        await tx.wallet.update({
          where: { id: wallet.id },
          data: {
            committedCents: { decrement: refundAmount },
          },
        });
        await tx.walletLedgerEntry.create({
          data: { walletId: wallet.id, kind: "RELEASE", amountCents: refundAmount, lotId },
        });
      }

      return tx.lot.update({
        where: { id: lotId },
        data: { status: "CANCELLED", closedAt: new Date() },
      });
    });
  }

  async getBidderPosition(lotId: string, bidderId: string): Promise<BidderPosition> {
    const lot = await this.prisma.lot.findUniqueOrThrow({ where: { id: lotId } });

    const bids = await this.prisma.bid.findMany({
      where: { lotId },
      orderBy: { sequence: "desc" },
    });

    if (bids.length === 0) {
      return {
        rank: null,
        lastBidCents: null,
        currentPriceCents: lot.currentBidCents,
        gapToLeadCents: null,
        isLeading: false,
      };
    }

    const myBids = bids.filter((b) => b.bidderId === bidderId);
    if (myBids.length === 0) {
      return {
        rank: null,
        lastBidCents: null,
        currentPriceCents: lot.currentBidCents,
        gapToLeadCents: null,
        isLeading: false,
      };
    }

    const lastBidCents = myBids[0]?.amountCents ?? null;

    const uniqueBidders = [...new Set(bids.map((b) => b.bidderId))];
    const bidderHighest = new Map<string, bigint>();
    for (const bid of bids) {
      const prev = bidderHighest.get(bid.bidderId);
      if (prev === undefined || bid.amountCents > prev) {
        bidderHighest.set(bid.bidderId, bid.amountCents);
      }
    }

    const sorted = [...bidderHighest.entries()].sort((a, b) => (b[1] > a[1] ? 1 : -1));
    const rank = sorted.findIndex(([id]) => id === bidderId) + 1;
    const isLeading = rank === 1;
    const leadAmount = sorted[0]?.[1];
    const myAmount = bidderHighest.get(bidderId) ?? 0n;
    const gapToLeadCents = isLeading ? 0n : (leadAmount ?? 0n) - myAmount;

    void uniqueBidders;
    return {
      rank,
      lastBidCents,
      currentPriceCents: lot.currentBidCents ?? null,
      gapToLeadCents,
      isLeading,
    };
  }

  async list(opts: { status?: LotStatus; cursor?: string; limit: number }): Promise<LotPage> {
    const items = await this.prisma.lot.findMany({
      where: opts.status ? { status: opts.status } : undefined,
      orderBy: { endsAt: "asc" },
      take: opts.limit + 1,
      ...(opts.cursor ? { skip: 1, cursor: { id: opts.cursor } } : {}),
      include: { snapshot: true },
    });

    const hasNext = items.length > opts.limit;
    if (hasNext) items.pop();

    return {
      items,
      nextCursor: hasNext ? (items[items.length - 1]?.id ?? null) : null,
    };
  }
}
