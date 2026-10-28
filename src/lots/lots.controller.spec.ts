import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { RolesGuard } from "../auth/roles.guard";
import { SessionGuard } from "../auth/session.guard";
import { CatalogService } from "../catalog/catalog.service";
import { SettlementService } from "../settlement/settlement.service";
import { LotsController } from "./lots.controller";
import { LotsService } from "./lots.service";

const passGuard = { canActivate: () => true };

const mockLot = {
  id: "lot-1",
  title: "Seurat Painting",
  description: null,
  status: "SCHEDULED",
  startingBidCents: 10000n,
  minIncrementCents: 500n,
  currentBidCents: null,
  bidCount: 0,
  startsAt: new Date("2030-01-01"),
  endsAt: new Date("2030-01-02"),
  originalEndsAt: new Date("2030-01-02"),
  auctioneerId: "user-1",
  snapshotId: "snap-1",
  category: "ART_INSTITUTE_CHICAGO",
  lotCategory: "FINE_ART",
  leadingBidderId: null,
  chainHeadHash: null,
  chainHeadSignature: null,
  closedAt: null,
  cancelledAt: null,
  additionalImages: [],
  createdAt: new Date(),
};

const mockLotWithSnapshot = {
  ...mockLot,
  snapshot: {
    id: "snap-1",
    sourceImageUrl: "https://example.com/img.jpg",
    provider: "ART_INSTITUTE_CHICAGO",
    externalId: "ext-1",
    attributes: { artist: "Seurat" },
  },
};

const mockLotsService = {
  create: jest.fn(),
  list: jest.fn(),
  findById: jest.fn(),
  findByIdWithSnapshot: jest.fn(),
  cancel: jest.fn(),
  getBidderPosition: jest.fn(),
};

const mockCatalogService = {
  fetchAndSnapshot: jest.fn(),
  getSnapshotByExternalId: jest.fn(),
};

const mockSettlementService = {
  getReceiptByToken: jest.fn(),
};

describe("LotsController", () => {
  let ctrl: LotsController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      controllers: [LotsController],
      providers: [
        { provide: LotsService, useValue: mockLotsService },
        { provide: CatalogService, useValue: mockCatalogService },
        { provide: SettlementService, useValue: mockSettlementService },
      ],
    })
      .overrideGuard(SessionGuard)
      .useValue(passGuard)
      .overrideGuard(RolesGuard)
      .useValue(passGuard)
      .compile();
    ctrl = module.get(LotsController);
  });

  describe("create", () => {
    const req = { user: { id: "user-1" } } as never;

    it("creates lot with snapshotId", async () => {
      mockLotsService.create.mockResolvedValue(mockLot);
      const body = {
        snapshotId: "snap-1",
        title: "Seurat",
        category: "ART_INSTITUTE_CHICAGO",
        startingBidCents: 10000,
        minIncrementCents: 500,
        startsAt: "2030-01-01T00:00:00.000Z",
        endsAt: "2030-01-02T00:00:00.000Z",
      };
      const result = await ctrl.create(req, body);
      expect(result.id).toBe("lot-1");
      expect(result.startingBidCents).toBe("10000");
    });

    it("creates lot via providerKey+providerId", async () => {
      mockCatalogService.fetchAndSnapshot.mockResolvedValue({});
      mockCatalogService.getSnapshotByExternalId.mockResolvedValue({ id: "snap-2" });
      mockLotsService.create.mockResolvedValue({ ...mockLot, snapshotId: "snap-2" });
      const body = {
        providerKey: "ART_INSTITUTE_CHICAGO",
        providerId: "ext-1",
        title: "Seurat",
        category: "ART_INSTITUTE_CHICAGO",
        startingBidCents: 10000,
        minIncrementCents: 500,
        startsAt: "2030-01-01T00:00:00.000Z",
        endsAt: "2030-01-02T00:00:00.000Z",
      };
      const result = await ctrl.create(req, body);
      expect(result.id).toBe("lot-1");
    });

    it("throws BadRequest when no snapshotId or providerKey+providerId", async () => {
      const body = {
        title: "Seurat",
        category: "ART_INSTITUTE_CHICAGO",
        startingBidCents: 10000,
        minIncrementCents: 500,
        startsAt: "2030-01-01T00:00:00.000Z",
        endsAt: "2030-01-02T00:00:00.000Z",
      };
      await expect(ctrl.create(req, body)).rejects.toThrow(BadRequestException);
    });

    it("throws BadRequest on invalid body", async () => {
      await expect(ctrl.create(req, { title: "" })).rejects.toThrow(BadRequestException);
    });
  });

  describe("list", () => {
    it("lists lots without filters", async () => {
      mockLotsService.list.mockResolvedValue({ items: [mockLotWithSnapshot], nextCursor: null });
      const result = await ctrl.list();
      expect(result.items).toHaveLength(1);
      expect(result.items[0].imageUrl).toBe("https://example.com/img.jpg");
    });

    it("filters by valid status", async () => {
      mockLotsService.list.mockResolvedValue({ items: [], nextCursor: null });
      const result = await ctrl.list("LIVE");
      expect(mockLotsService.list).toHaveBeenCalledWith(
        expect.objectContaining({ status: "LIVE" }),
      );
      expect(result.items).toHaveLength(0);
    });

    it("ignores invalid status", async () => {
      mockLotsService.list.mockResolvedValue({ items: [], nextCursor: null });
      await ctrl.list("INVALID_STATUS");
      expect(mockLotsService.list).toHaveBeenCalledWith(
        expect.objectContaining({ status: undefined }),
      );
    });

    it("passes endsToday filter", async () => {
      mockLotsService.list.mockResolvedValue({ items: [], nextCursor: null });
      await ctrl.list(undefined, undefined, "true");
      expect(mockLotsService.list).toHaveBeenCalledWith(
        expect.objectContaining({ endsToday: true }),
      );
    });

    it("passes cursor for pagination", async () => {
      mockLotsService.list.mockResolvedValue({ items: [], nextCursor: "lot-2" });
      const result = await ctrl.list(undefined, undefined, undefined, 20, "lot-1");
      expect(result.nextCursor).toBe("lot-2");
    });
  });

  describe("findOne", () => {
    it("returns serialized lot with snapshot", async () => {
      mockLotsService.findByIdWithSnapshot.mockResolvedValue(mockLotWithSnapshot);
      const result = await ctrl.findOne("lot-1");
      expect(result.id).toBe("lot-1");
      expect(result.imageUrl).toBe("https://example.com/img.jpg");
      expect(result.currentBidCents).toBeNull();
    });

    it("throws NotFoundException when lot not found", async () => {
      mockLotsService.findByIdWithSnapshot.mockRejectedValue(new Error("Not found"));
      await expect(ctrl.findOne("missing")).rejects.toThrow(NotFoundException);
    });
  });

  describe("cancel", () => {
    const req = { user: { id: "user-1" } } as never;

    it("cancels a lot", async () => {
      const cancelled = { ...mockLot, status: "CANCELLED" };
      mockLotsService.cancel.mockResolvedValue(cancelled);
      const result = await ctrl.cancel("lot-1", req);
      expect(result.status).toBe("CANCELLED");
    });
  });

  describe("getBidderPosition", () => {
    const req = { user: { id: "user-1" } } as never;

    it("returns bidder position", async () => {
      mockLotsService.getBidderPosition.mockResolvedValue({
        rank: 1,
        lastBidCents: 1500n,
        currentPriceCents: 1500n,
        gapToLeadCents: 0n,
        isLeading: true,
      });
      const result = await ctrl.getBidderPosition("lot-1", req);
      expect(result.rank).toBe(1);
      expect(result.isLeading).toBe(true);
      expect(result.lastBidCents).toBe("1500");
      expect(result.gapToLeadCents).toBe("0");
    });

    it("returns null cents when bidder has no bids", async () => {
      mockLotsService.getBidderPosition.mockResolvedValue({
        rank: null,
        lastBidCents: null,
        currentPriceCents: null,
        gapToLeadCents: null,
        isLeading: false,
      });
      const result = await ctrl.getBidderPosition("lot-1", req);
      expect(result.lastBidCents).toBeNull();
    });
  });

  describe("getReceipt", () => {
    it("returns receipt with lot title", async () => {
      mockSettlementService.getReceiptByToken.mockResolvedValue({
        lotId: "lot-1",
        winnerId: "user-2",
        amountCents: 15000n,
        publicToken: "tok-abc",
        issuedAt: new Date("2024-01-01"),
        finalChainHash: "hash-xyz",
      });
      mockLotsService.findById.mockResolvedValue(mockLot);
      const result = await ctrl.getReceipt("tok-abc");
      expect(result.lotTitle).toBe("Seurat Painting");
      expect(result.amountCents).toBe("15000");
      expect(result.publicToken).toBe("tok-abc");
    });

    it("throws NotFoundException when token invalid", async () => {
      mockSettlementService.getReceiptByToken.mockRejectedValue(new Error("not found"));
      await expect(ctrl.getReceipt("bad-token")).rejects.toThrow(NotFoundException);
    });
  });
});

// Keep ForbiddenException in scope (used in service, verified via controller integration)
void ForbiddenException;
