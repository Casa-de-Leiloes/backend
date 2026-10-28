import { BadRequestException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { CatalogController } from "./catalog.controller";
import { CatalogService } from "./catalog.service";

const mockCatalogService = {
  search: jest.fn(),
};

describe("CatalogController", () => {
  let ctrl: CatalogController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      controllers: [CatalogController],
      providers: [{ provide: CatalogService, useValue: mockCatalogService }],
    }).compile();
    ctrl = module.get(CatalogController);
  });

  describe("search", () => {
    it("returns search results for valid provider", async () => {
      mockCatalogService.search.mockResolvedValue([
        { providerId: "123", title: "Water Lilies", description: "Monet", imageUrl: null, externalUrl: null, metadata: {} },
      ]);
      const result = await ctrl.search("monet", "ART_INSTITUTE_CHICAGO");
      expect(result.items).toHaveLength(1);
      expect(result.items[0].title).toBe("Water Lilies");
      expect(mockCatalogService.search).toHaveBeenCalledWith("ART_INSTITUTE_CHICAGO", "monet", 1);
    });

    it("throws BadRequest when query is empty", async () => {
      await expect(ctrl.search("", "ART_INSTITUTE_CHICAGO")).rejects.toThrow(BadRequestException);
    });

    it("throws BadRequest when query is whitespace only", async () => {
      await expect(ctrl.search("   ", "ART_INSTITUTE_CHICAGO")).rejects.toThrow(BadRequestException);
    });

    it("throws BadRequest for invalid provider", async () => {
      await expect(ctrl.search("monet", "INVALID_PROVIDER")).rejects.toThrow(BadRequestException);
    });

    it("returns results for SCRYFALL provider", async () => {
      mockCatalogService.search.mockResolvedValue([]);
      const result = await ctrl.search("lightning bolt", "SCRYFALL");
      expect(result.items).toHaveLength(0);
    });

    it("returns results for OPEN_LIBRARY provider", async () => {
      mockCatalogService.search.mockResolvedValue([]);
      const result = await ctrl.search("dom casmurro", "OPEN_LIBRARY");
      expect(result.items).toHaveLength(0);
    });
  });
});
