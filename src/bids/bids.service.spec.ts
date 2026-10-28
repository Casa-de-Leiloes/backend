import { Test } from "@nestjs/testing";
import { LotSchedulerService } from "../lots/lot-scheduler.service";
import { PrismaService } from "../prisma/prisma.service";
import { BidsService } from "./bids.service";

const futureDate = (minutesFromNow: number) => new Date(Date.now() + minutesFromNow * 60_000);
const pastDate = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000);

const makeLot = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: "lot-1",
  status: "LIVE",
  endsAt: futureDate(10),
  startingBidCents: 1000n,
  minIncrementCents: 100n,
  currentBidCents: null,
  leadingBidderId: null,
  chainHeadHash: null,
  bidCount: 0,
  ...overrides,
});

const mockTx = {
  $executeRaw: jest.fn().mockResolvedValue(1),
  lot: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  bid: {
    create: jest.fn(),
  },
  wallet: {
    findUniqueOrThrow: jest.fn(),
    update: jest.fn(),
  },
  walletLedgerEntry: {
    create: jest.fn(),
  },
  lotExtension: {
    create: jest.fn(),
  },
};

const mockPrisma = {
  $transaction: jest.fn(),
  bid: {
    findMany: jest.fn(),
  },
  receipt: {
    findMany: jest.fn(),
  },
};

const mockLotScheduler = {
  rescheduleClose: jest.fn(),
};

describe("BidsService", () => {
  let svc: BidsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.$transaction.mockImplementation(
      async (fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx),
    );
    const module = await Test.createTestingModule({
      providers: [
        BidsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: LotSchedulerService, useValue: mockLotScheduler },
      ],
    }).compile();
    svc = module.get(BidsService);
  });

  it("rejects bid on non-LIVE lot", async () => {
    mockTx.lot.findUnique.mockResolvedValue(makeLot({ status: "SCHEDULED" }));
    await expect(
      svc.placeBid({ lotId: "lot-1", bidderId: "user-1", walletId: "w-1", amountCents: 1000n }),
    ).rejects.toThrow("LOT_NOT_LIVE");
  });

  it("rejects bid on closed (past endsAt) lot", async () => {
    mockTx.lot.findUnique.mockResolvedValue(makeLot({ endsAt: pastDate(1) }));
    await expect(
      svc.placeBid({ lotId: "lot-1", bidderId: "user-1", walletId: "w-1", amountCents: 1000n }),
    ).rejects.toThrow("LOT_NOT_LIVE");
  });

  it("rejects bid below starting bid when no current bid", async () => {
    mockTx.lot.findUnique.mockResolvedValue(makeLot());
    await expect(
      svc.placeBid({ lotId: "lot-1", bidderId: "user-1", walletId: "w-1", amountCents: 500n }),
    ).rejects.toThrow("BID_TOO_LOW");
  });

  it("rejects bid below minimum increment over current bid", async () => {
    mockTx.lot.findUnique.mockResolvedValue(makeLot({ currentBidCents: 1000n }));
    await expect(
      svc.placeBid({ lotId: "lot-1", bidderId: "user-1", walletId: "w-1", amountCents: 1050n }),
    ).rejects.toThrow("BID_TOO_LOW");
  });

  it("rejects bid from the leading bidder on their own lot", async () => {
    mockTx.lot.findUnique.mockResolvedValue(
      makeLot({ currentBidCents: 1000n, leadingBidderId: "user-1" }),
    );
    await expect(
      svc.placeBid({ lotId: "lot-1", bidderId: "user-1", walletId: "w-1", amountCents: 1100n }),
    ).rejects.toThrow("ALREADY_LEADING");
  });

  it("rejects bid with insufficient wallet balance", async () => {
    mockTx.lot.findUnique.mockResolvedValue(makeLot());
    mockTx.wallet.findUniqueOrThrow.mockResolvedValue({
      id: "w-1",
      totalCents: 500n,
      committedCents: 0n,
    });
    await expect(
      svc.placeBid({ lotId: "lot-1", bidderId: "user-1", walletId: "w-1", amountCents: 1000n }),
    ).rejects.toThrow("INSUFFICIENT_BALANCE");
  });

  it("accepts first valid bid, commits wallet, and updates lot", async () => {
    const lot = makeLot();
    mockTx.lot.findUnique.mockResolvedValue(lot);
    mockTx.wallet.findUniqueOrThrow.mockResolvedValue({
      id: "w-1",
      totalCents: 50000n,
      committedCents: 0n,
    });
    mockTx.wallet.update.mockResolvedValue({});
    mockTx.walletLedgerEntry.create.mockResolvedValue({});
    mockTx.bid.create.mockResolvedValue({
      id: "bid-new",
      lotId: "lot-1",
      hash: "abc",
      sequence: 1,
      previousHash: "genesis",
      signature: "sig",
      amountCents: 1000n,
      bidderId: "user-1",
      placedAt: new Date(),
    });
    mockTx.lot.update.mockResolvedValue({ ...lot, currentBidCents: 1000n });
    mockTx.lotExtension.create.mockResolvedValue({});

    const bid = await svc.placeBid({
      lotId: "lot-1",
      bidderId: "user-1",
      walletId: "w-1",
      amountCents: 1000n,
    });
    expect(bid.id).toBe("bid-new");
    expect(bid.previousHash).toBe("genesis");
    expect(mockTx.wallet.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ committedCents: expect.anything() }),
      }),
    );
    expect(mockTx.lot.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ currentBidCents: 1000n }) }),
    );
  });

  it("releases previous leader's committed funds on new bid", async () => {
    const lot = makeLot({ currentBidCents: 1000n, leadingBidderId: "prev-leader" });
    mockTx.lot.findUnique.mockResolvedValue(lot);
    mockTx.wallet.findUniqueOrThrow
      .mockResolvedValueOnce({ id: "w-1", totalCents: 50000n, committedCents: 0n })
      .mockResolvedValueOnce({ id: "w-prev", totalCents: 0n, committedCents: 1000n });
    mockTx.wallet.update.mockResolvedValue({});
    mockTx.walletLedgerEntry.create.mockResolvedValue({});
    mockTx.bid.create.mockResolvedValue({
      id: "bid-2",
      lotId: "lot-1",
      hash: "def",
      sequence: 2,
      previousHash: "abc",
      signature: "sig2",
      amountCents: 1100n,
      bidderId: "user-1",
      placedAt: new Date(),
    });
    mockTx.lot.update.mockResolvedValue({ ...lot, currentBidCents: 1100n });
    mockTx.lotExtension.create.mockResolvedValue({});

    await svc.placeBid({ lotId: "lot-1", bidderId: "user-1", walletId: "w-1", amountCents: 1100n });
    // Two wallet.findUniqueOrThrow: prev leader + new bidder
    expect(mockTx.wallet.findUniqueOrThrow).toHaveBeenCalledTimes(2);
  });
});

describe("BidsService — read methods", () => {
  let svc: BidsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.$transaction.mockImplementation(
      async (fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx),
    );
    const module = await Test.createTestingModule({
      providers: [
        BidsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: LotSchedulerService, useValue: mockLotScheduler },
      ],
    }).compile();
    svc = module.get(BidsService);
  });

  describe("getBidsForLot", () => {
    it("returns bids ordered by sequence", async () => {
      const bids = [
        { id: "b1", sequence: 1, bidderId: "user-1", amountCents: 1000n },
        { id: "b2", sequence: 2, bidderId: "user-2", amountCents: 1100n },
      ];
      mockPrisma.bid.findMany.mockResolvedValue(bids);
      const result = await svc.getBidsForLot("lot-1");
      expect(result).toHaveLength(2);
      expect(result[0].sequence).toBe(1);
    });
  });

  describe("getPseudonym", () => {
    it("returns deterministic pseudonym string", () => {
      const p1 = svc.getPseudonym("user-abc");
      const p2 = svc.getPseudonym("user-abc");
      expect(p1).toBe(p2);
      expect(typeof p1).toBe("string");
      expect(p1.length).toBeGreaterThan(0);
    });

    it("returns different pseudonyms for different bidder ids", () => {
      const p1 = svc.getPseudonym("user-1");
      const p2 = svc.getPseudonym("user-2");
      expect(p1).not.toBe(p2);
    });
  });

  describe("getMyBids", () => {
    it("returns paginated bids", async () => {
      const bids = Array.from({ length: 6 }, (_, i) => ({
        id: `bid-${i}`,
        bidderId: "user-1",
        sequence: i + 1,
        amountCents: 1000n,
        placedAt: new Date(),
      }));
      mockPrisma.bid.findMany.mockResolvedValue(bids);
      const result = await svc.getMyBids("user-1", undefined, 5);
      expect(result.items).toHaveLength(5);
      expect(result.nextCursor).toBe("bid-4");
    });

    it("returns no cursor when fewer items than limit", async () => {
      mockPrisma.bid.findMany.mockResolvedValue([{ id: "bid-1", bidderId: "user-1" }]);
      const result = await svc.getMyBids("user-1");
      expect(result.nextCursor).toBeNull();
    });
  });

  describe("getMyWins", () => {
    it("returns won auctions with receipt tokens", async () => {
      mockPrisma.receipt.findMany.mockResolvedValue([
        { lotId: "lot-1", amountCents: 5000n, publicToken: "tok-abc", winnerId: "user-1", issuedAt: new Date() },
      ]);
      const wins = await svc.getMyWins("user-1");
      expect(wins).toHaveLength(1);
      expect(wins[0].receiptToken).toBe("tok-abc");
      expect(wins[0].amountCents).toBe(5000n);
    });

    it("returns empty array when no wins", async () => {
      mockPrisma.receipt.findMany.mockResolvedValue([]);
      const wins = await svc.getMyWins("user-1");
      expect(wins).toHaveLength(0);
    });
  });
});
