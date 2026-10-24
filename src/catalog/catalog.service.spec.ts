import { Test } from "@nestjs/testing";
import { REDIS_CLIENT } from "../redis/redis.constants";
import { AicAdapter } from "./adapters/aic.adapter";
import { OpenLibraryAdapter } from "./adapters/open-library.adapter";
import { ScryfallAdapter } from "./adapters/scryfall.adapter";
import { CatalogService } from "./catalog.service";
import type { CatalogItem } from "./catalog.types";

const fakeItem: CatalogItem = {
  providerId: "123",
  provider: "ART_INSTITUTE_CHICAGO",
  title: "Test Art",
  description: "desc",
  imageUrl: null,
  externalUrl: null,
  metadata: {},
};

const mockRedis = {
  get: jest.fn(),
  set: jest.fn(),
};

const mockPrisma = {
  catalogItemSnapshot: {
    upsert: jest.fn(),
    findUnique: jest.fn(),
  },
};

describe("CatalogService", () => {
  let svc: CatalogService;
  let aicAdapter: jest.Mocked<AicAdapter>;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockRedis.get.mockResolvedValue(null);
    mockRedis.set.mockResolvedValue("OK");

    const module = await Test.createTestingModule({
      providers: [
        CatalogService,
        { provide: REDIS_CLIENT, useValue: mockRedis },
        { provide: "PRISMA_SERVICE", useValue: mockPrisma },
        AicAdapter,
        ScryfallAdapter,
        OpenLibraryAdapter,
      ],
    }).compile();

    svc = module.get(CatalogService);
    aicAdapter = module.get(AicAdapter) as jest.Mocked<AicAdapter>;
  });

  describe("search", () => {
    it("delegates to the correct provider adapter", async () => {
      jest.spyOn(aicAdapter, "search").mockResolvedValue([fakeItem]);
      const results = await svc.search("ART_INSTITUTE_CHICAGO", "Seurat", 1);
      expect(results).toEqual([fakeItem]);
    });

    it("returns cached results when cache hit", async () => {
      const cached = JSON.stringify([fakeItem]);
      mockRedis.get.mockResolvedValue(cached);
      jest.spyOn(aicAdapter, "search");
      const results = await svc.search("ART_INSTITUTE_CHICAGO", "Seurat", 1);
      expect(results).toHaveLength(1);
      expect(aicAdapter.search).not.toHaveBeenCalled();
    });

    it("falls back to empty array when provider throws", async () => {
      mockRedis.get.mockResolvedValue(null);
      jest.spyOn(aicAdapter, "search").mockRejectedValue(new Error("network error"));
      const results = await svc.search("ART_INSTITUTE_CHICAGO", "Seurat", 1);
      expect(results).toEqual([]);
    });
  });

  describe("fetchAndSnapshot", () => {
    it("fetches item and upserts snapshot", async () => {
      jest.spyOn(aicAdapter, "fetchById").mockResolvedValue(fakeItem);
      mockPrisma.catalogItemSnapshot.upsert.mockResolvedValue({});
      const item = await svc.fetchAndSnapshot("ART_INSTITUTE_CHICAGO", "123");
      expect(item.providerId).toBe("123");
      expect(mockPrisma.catalogItemSnapshot.upsert).toHaveBeenCalled();
    });
  });
});
