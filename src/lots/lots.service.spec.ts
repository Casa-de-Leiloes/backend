import { Test } from "@nestjs/testing";
import { LotsService } from "./lots.service";
import { PrismaService } from "../prisma/prisma.service";

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

const mockPrisma = {
  lot: {
    create: jest.fn(),
    findUniqueOrThrow: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    update: jest.fn(),
  },
};

describe("LotsService", () => {
  let svc: LotsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        LotsService,
        { provide: PrismaService, useValue: mockPrisma },
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
  });
});
