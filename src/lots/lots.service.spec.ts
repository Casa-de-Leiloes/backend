import { Test } from "@nestjs/testing";
import { PrismaService } from "../prisma/prisma.service";
import { LotSchedulerService } from "./lot-scheduler.service";
import { LotsService } from "./lots.service";

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
  leadingBidderId: null,
  chainHeadHash: null,
  chainHeadSignature: null,
  closedAt: null,
  cancelledAt: null,
  createdAt: new Date(),
};

const mockTx = {
  lot: {
    findUniqueOrThrow: jest.fn(),
    update: jest.fn(),
  },
  bid: {
    groupBy: jest.fn(),
  },
  wallet: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  walletLedgerEntry: {
    create: jest.fn(),
  },
};

const mockPrisma = {
  $transaction: jest.fn(),
  lot: {
    create: jest.fn(),
    findUniqueOrThrow: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    update: jest.fn(),
  },
  bid: {
    findMany: jest.fn(),
  },
};

const mockLotScheduler = {
  scheduleLot: jest.fn(),
};

describe("LotsService", () => {
  let svc: LotsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.$transaction.mockImplementation(
      async (fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx),
    );
    const module = await Test.createTestingModule({
      providers: [
        LotsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: LotSchedulerService, useValue: mockLotScheduler },
      ],
    }).compile();
    svc = module.get(LotsService);
  });

  describe("create", () => {
    it("creates a SCHEDULED lot", async () => {
      mockPrisma.lot.create.mockResolvedValue(mockLot);
      const lot = await svc.create({
        auctioneerId: "user-1",
        snapshotId: "snap-1",
        title: "Seurat Painting",
        category: "ART_INSTITUTE_CHICAGO",
        startingBidCents: 10000n,
        minIncrementCents: 500n,
        startsAt: new Date("2030-01-01"),
        endsAt: new Date("2030-01-02"),
      });
      expect(lot.id).toBe("lot-1");
      expect(mockPrisma.lot.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: "SCHEDULED" }) }),
      );
    });
  });

  describe("findById", () => {
    it("returns lot by id", async () => {
      mockPrisma.lot.findUniqueOrThrow.mockResolvedValue(mockLot);
      const lot = await svc.findById("lot-1");
      expect(lot.id).toBe("lot-1");
    });
  });

  describe("list", () => {
    it("returns paginated lots with next cursor", async () => {
      mockPrisma.lot.findMany.mockResolvedValue([mockLot]);
      const result = await svc.list({ status: "SCHEDULED", limit: 10, cursor: undefined });
      expect(result.items).toHaveLength(1);
    });

    it("returns empty list when no lots match", async () => {
      mockPrisma.lot.findMany.mockResolvedValue([]);
      const result = await svc.list({ status: "LIVE", limit: 10, cursor: undefined });
      expect(result.items).toHaveLength(0);
      expect(result.nextCursor).toBeNull();
    });

    it("returns nextCursor when more items exist", async () => {
      const lots = Array.from({ length: 11 }, (_, i) => ({ ...mockLot, id: `lot-${i}` }));
      mockPrisma.lot.findMany.mockResolvedValue(lots);
      const result = await svc.list({ limit: 10, cursor: undefined });
      expect(result.items).toHaveLength(10);
      expect(result.nextCursor).toBe("lot-9");
    });

    it("filters by lotCategory when valid", async () => {
      mockPrisma.lot.findMany.mockResolvedValue([mockLot]);
      await svc.list({ lotCategory: "FINE_ART", limit: 10, cursor: undefined });
      expect(mockPrisma.lot.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ lotCategory: "FINE_ART" }) }),
      );
    });

    it("ignores invalid lotCategory", async () => {
      mockPrisma.lot.findMany.mockResolvedValue([]);
      await svc.list({ lotCategory: "INVALID_CAT", limit: 10, cursor: undefined });
      const call = mockPrisma.lot.findMany.mock.calls[0][0];
      expect(call.where?.lotCategory).toBeUndefined();
    });
  });

  describe("cancel", () => {
    it("throws Forbidden when requester is not auctioneer", async () => {
      mockTx.lot.findUniqueOrThrow.mockResolvedValue({ ...mockLot, auctioneerId: "other-user" });
      await expect(svc.cancel("lot-1", "user-1")).rejects.toThrow("FORBIDDEN_ROLE");
    });

    it("throws Forbidden when lot is already CLOSED", async () => {
      mockTx.lot.findUniqueOrThrow.mockResolvedValue({ ...mockLot, status: "CLOSED", auctioneerId: "user-1" });
      await expect(svc.cancel("lot-1", "user-1")).rejects.toThrow("LOT_ALREADY_CLOSED");
    });

    it("throws Forbidden when lot is already CANCELLED", async () => {
      mockTx.lot.findUniqueOrThrow.mockResolvedValue({ ...mockLot, status: "CANCELLED", auctioneerId: "user-1" });
      await expect(svc.cancel("lot-1", "user-1")).rejects.toThrow("LOT_ALREADY_CANCELLED");
    });

    it("cancels lot and refunds bidders", async () => {
      mockTx.lot.findUniqueOrThrow.mockResolvedValue({ ...mockLot, status: "LIVE", auctioneerId: "user-1" });
      mockTx.bid.groupBy.mockResolvedValue([
        { bidderId: "bidder-1", _max: { amountCents: 5000n } },
      ]);
      mockTx.wallet.findUnique.mockResolvedValue({ id: "w-bidder", userId: "bidder-1" });
      mockTx.wallet.update.mockResolvedValue({});
      mockTx.walletLedgerEntry.create.mockResolvedValue({});
      mockTx.lot.update.mockResolvedValue({ ...mockLot, status: "CANCELLED" });

      const result = await svc.cancel("lot-1", "user-1");
      expect(result.status).toBe("CANCELLED");
      expect(mockTx.wallet.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { committedCents: { decrement: 5000n } } }),
      );
    });

    it("skips refund when bidder wallet not found", async () => {
      mockTx.lot.findUniqueOrThrow.mockResolvedValue({ ...mockLot, status: "LIVE", auctioneerId: "user-1" });
      mockTx.bid.groupBy.mockResolvedValue([
        { bidderId: "bidder-ghost", _max: { amountCents: 5000n } },
      ]);
      mockTx.wallet.findUnique.mockResolvedValue(null);
      mockTx.lot.update.mockResolvedValue({ ...mockLot, status: "CANCELLED" });

      const result = await svc.cancel("lot-1", "user-1");
      expect(result.status).toBe("CANCELLED");
      expect(mockTx.wallet.update).not.toHaveBeenCalled();
    });
  });

  describe("getBidderPosition", () => {
    it("returns null position when no bids", async () => {
      mockPrisma.lot.findUniqueOrThrow.mockResolvedValue(mockLot);
      mockPrisma.bid.findMany.mockResolvedValue([]);
      const pos = await svc.getBidderPosition("lot-1", "user-1");
      expect(pos.rank).toBeNull();
      expect(pos.isLeading).toBe(false);
    });

    it("returns null position when bidder has no bids", async () => {
      mockPrisma.lot.findUniqueOrThrow.mockResolvedValue(mockLot);
      mockPrisma.bid.findMany.mockResolvedValue([
        { bidderId: "other-user", amountCents: 5000n, sequence: 1 },
      ]);
      const pos = await svc.getBidderPosition("lot-1", "user-1");
      expect(pos.rank).toBeNull();
    });

    it("returns rank=1 and isLeading=true for leading bidder", async () => {
      mockPrisma.lot.findUniqueOrThrow.mockResolvedValue({ ...mockLot, currentBidCents: 5000n });
      mockPrisma.bid.findMany.mockResolvedValue([
        { bidderId: "user-1", amountCents: 5000n, sequence: 2 },
        { bidderId: "user-2", amountCents: 3000n, sequence: 1 },
      ]);
      const pos = await svc.getBidderPosition("lot-1", "user-1");
      expect(pos.rank).toBe(1);
      expect(pos.isLeading).toBe(true);
      expect(pos.gapToLeadCents).toBe(0n);
    });

    it("returns correct rank and gap for non-leading bidder", async () => {
      mockPrisma.lot.findUniqueOrThrow.mockResolvedValue({ ...mockLot, currentBidCents: 5000n });
      mockPrisma.bid.findMany.mockResolvedValue([
        { bidderId: "user-2", amountCents: 5000n, sequence: 2 },
        { bidderId: "user-1", amountCents: 3000n, sequence: 1 },
      ]);
      const pos = await svc.getBidderPosition("lot-1", "user-1");
      expect(pos.rank).toBe(2);
      expect(pos.isLeading).toBe(false);
      expect(pos.gapToLeadCents).toBe(2000n);
    });
  });
});
