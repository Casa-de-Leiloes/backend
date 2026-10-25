import { Test } from "@nestjs/testing";
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
};

const mockPrisma = {
  $transaction: jest.fn(),
};

describe("BidsService", () => {
  let svc: BidsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.$transaction.mockImplementation(
      async (fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx),
    );
    const module = await Test.createTestingModule({
      providers: [BidsService, { provide: PrismaService, useValue: mockPrisma }],
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
});
