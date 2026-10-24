import { Injectable } from "@nestjs/common";
import type { Lot, LotStatus, CatalogProvider } from "@prisma/client";
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

export interface LotPage {
  items: Lot[];
  nextCursor: string | null;
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

  async list(opts: {
    status?: LotStatus;
    cursor?: string;
    limit: number;
  }): Promise<LotPage> {
    const items = await this.prisma.lot.findMany({
      where: opts.status ? { status: opts.status } : undefined,
      orderBy: { endsAt: "asc" },
      take: opts.limit + 1,
      ...(opts.cursor ? { skip: 1, cursor: { id: opts.cursor } } : {}),
    });

    const hasNext = items.length > opts.limit;
    if (hasNext) items.pop();

    return {
      items,
      nextCursor: hasNext ? (items[items.length - 1]?.id ?? null) : null,
    };
  }
}
