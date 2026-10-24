import { Injectable, Inject } from "@nestjs/common";
import type { Redis } from "ioredis";
import type { PrismaService } from "../prisma/prisma.service";
import { CatalogProvider as CatalogProviderEnum } from "@prisma/client";
import { REDIS_CLIENT } from "../redis/redis.constants";
import { AicAdapter } from "./adapters/aic.adapter";
import { ScryfallAdapter } from "./adapters/scryfall.adapter";
import { OpenLibraryAdapter } from "./adapters/open-library.adapter";
import type { CatalogItem, CatalogProvider } from "./catalog.types";

const CACHE_TTL_SECONDS = 3600;

const PROVIDER_MAP: Record<string, CatalogProviderEnum> = {
  ART_INSTITUTE_CHICAGO: CatalogProviderEnum.ART_INSTITUTE_CHICAGO,
  SCRYFALL: CatalogProviderEnum.SCRYFALL,
  OPEN_LIBRARY: CatalogProviderEnum.OPEN_LIBRARY,
};

@Injectable()
export class CatalogService {
  private readonly adapters: Map<string, import("./catalog.types").CatalogProvider>;

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Inject("PRISMA_SERVICE") private readonly prisma: PrismaService,
    private readonly aic: AicAdapter,
    private readonly scryfall: ScryfallAdapter,
    private readonly openLibrary: OpenLibraryAdapter,
  ) {
    const entries: [string, import("./catalog.types").CatalogProvider][] = [
      ["ART_INSTITUTE_CHICAGO", this.aic],
      ["SCRYFALL", this.scryfall],
      ["OPEN_LIBRARY", this.openLibrary],
    ];
    this.adapters = new Map(entries);
  }

  async search(providerKey: string, query: string, page: number): Promise<CatalogItem[]> {
    const cacheKey = `catalog:search:${providerKey}:${query}:${page}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached) as CatalogItem[];

    const adapter = this.adapters.get(providerKey);
    if (!adapter) return [];

    try {
      const results = await adapter.search(query, page);
      await this.redis.set(cacheKey, JSON.stringify(results), "EX", CACHE_TTL_SECONDS);
      return results;
    } catch {
      return [];
    }
  }

  async getSnapshotByExternalId(providerKey: string, id: string) {
    const prismaProvider = PROVIDER_MAP[providerKey];
    if (!prismaProvider) throw new Error(`Unknown provider: ${providerKey}`);
    return this.prisma.catalogItemSnapshot.findUniqueOrThrow({
      where: { provider_externalId: { provider: prismaProvider, externalId: id } },
    });
  }

  async fetchAndSnapshot(providerKey: string, id: string): Promise<CatalogItem> {
    const adapter = this.adapters.get(providerKey);
    if (!adapter) throw new Error(`Unknown provider: ${providerKey}`);

    const prismaProvider = PROVIDER_MAP[providerKey];
    if (!prismaProvider) throw new Error(`No Prisma enum for provider: ${providerKey}`);

    const item = await adapter.fetchById(id);
    await this.prisma.catalogItemSnapshot.upsert({
      where: { provider_externalId: { provider: prismaProvider, externalId: id } },
      create: {
        provider: prismaProvider,
        externalId: id,
        title: item.title,
        attributes: { ...item.metadata, description: item.description, externalUrl: item.externalUrl },
        sourceImageUrl: item.imageUrl ?? "",
      },
      update: {
        title: item.title,
        attributes: { ...item.metadata, description: item.description, externalUrl: item.externalUrl },
        sourceImageUrl: item.imageUrl ?? "",
        fetchedAt: new Date(),
      },
    });
    return item;
  }
}
