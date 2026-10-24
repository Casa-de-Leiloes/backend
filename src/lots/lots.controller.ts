import {
  BadRequestException,
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  NotFoundException,
  Param,
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
import { CatalogService } from "../catalog/catalog.service";
import { LotsService } from "./lots.service";

const createLotSchema = z.object({
  snapshotId: z.string().optional(),
  providerKey: z.string().optional(),
  providerId: z.string().optional(),
  title: z.string().min(1),
  description: z.string().optional(),
  category: z.enum(["ART_INSTITUTE_CHICAGO", "SCRYFALL", "OPEN_LIBRARY"]),
  startingBidCents: z.number().int().positive(),
  minIncrementCents: z.number().int().positive(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
});

function serializeLot(lot: Awaited<ReturnType<LotsService["findById"]>>) {
  return {
    ...lot,
    startingBidCents: lot.startingBidCents.toString(),
    minIncrementCents: lot.minIncrementCents.toString(),
    currentBidCents: lot.currentBidCents?.toString() ?? null,
  };
}

@Controller("lots")
export class LotsController {
  constructor(
    private readonly lotsService: LotsService,
    private readonly catalogService: CatalogService,
  ) {}

  @Post()
  @UseGuards(SessionGuard, RolesGuard)
  @Roles("AUCTIONEER")
  async create(@Req() req: Request, @Body() body: unknown) {
    const parsed = createLotSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());

    const user = req.user as BetterAuthUser;
    const d = parsed.data;

    let snapshotId = d.snapshotId;
    if (!snapshotId && d.providerKey && d.providerId) {
      const item = await this.catalogService.fetchAndSnapshot(d.providerKey, d.providerId);
      const snap = await this.catalogService.getSnapshotByExternalId(d.providerKey, d.providerId);
      snapshotId = snap.id;
      void item;
    }
    if (!snapshotId) throw new BadRequestException("snapshotId or providerKey+providerId required");

    const lot = await this.lotsService.create({
      auctioneerId: user.id,
      snapshotId,
      title: d.title,
      description: d.description,
      category: d.category,
      startingBidCents: BigInt(d.startingBidCents),
      minIncrementCents: BigInt(d.minIncrementCents),
      startsAt: new Date(d.startsAt),
      endsAt: new Date(d.endsAt),
    });
    return serializeLot(lot);
  }

  @Get()
  async list(
    @Query("status") status?: string,
    @Query("limit", new DefaultValuePipe(20), ParseIntPipe) limit = 20,
    @Query("cursor") cursor?: string,
  ) {
    const validStatuses = ["SCHEDULED", "LIVE", "CLOSED", "CANCELLED"];
    const lotStatus =
      status && validStatuses.includes(status)
        ? (status as "SCHEDULED" | "LIVE" | "CLOSED" | "CANCELLED")
        : undefined;

    const page = await this.lotsService.list({
      status: lotStatus,
      limit: Math.min(limit, 100),
      cursor,
    });
    return {
      items: page.items.map(serializeLot),
      nextCursor: page.nextCursor,
    };
  }

  @Get(":id")
  async findOne(@Param("id") id: string) {
    try {
      const lot = await this.lotsService.findById(id);
      return serializeLot(lot);
    } catch {
      throw new NotFoundException(`Lot ${id} not found`);
    }
  }

  @Delete(":id")
  @UseGuards(SessionGuard, RolesGuard)
  @Roles("AUCTIONEER")
  async cancel(@Param("id") id: string, @Req() req: Request) {
    const user = req.user as BetterAuthUser;
    const lot = await this.lotsService.cancel(id, user.id);
    return serializeLot(lot);
  }

  @Get(":id/position")
  @UseGuards(SessionGuard)
  async getBidderPosition(@Param("id") id: string, @Req() req: Request) {
    const user = req.user as BetterAuthUser;
    const position = await this.lotsService.getBidderPosition(id, user.id);
    return {
      ...position,
      lastBidCents: position.lastBidCents?.toString() ?? null,
      currentPriceCents: position.currentPriceCents?.toString() ?? null,
      gapToLeadCents: position.gapToLeadCents?.toString() ?? null,
    };
  }
}
