import { Test } from "@nestjs/testing";
import { PrismaService } from "../prisma/prisma.service";
import { SettlementService } from "./settlement.service";

const mockTx = {
  lot: {
    findUniqueOrThrow: jest.fn(),
    update: jest.fn(),
  },
  receipt: {
    findUnique: jest.fn(),
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
  receipt: {
    findUniqueOrThrow: jest.fn(),
    findUnique: jest.fn(),
  },
};

const closedLot = {
  id: "lot-1",
  status: "CLOSED",
  leadingBidderId: "bidder-1",
  currentBidCents: 15000n,
  auctioneerId: "auctioneer-1",
  chainHeadHash: "abc123",
  auctioneer: { id: "auctioneer-1" },
};

describe("SettlementService", () => {
  let svc: SettlementService;

  beforeEach(async () => {
    jest.clearAllMocks();
    process.env.AUDIT_SIGNING_KEY = "test-signing-key";
    mockPrisma.$transaction.mockImplementation(
      async (fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx),
    );
    const module = await Test.createTestingModule({
      providers: [SettlementService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    svc = module.get(SettlementService);
  });

  describe("settleLot", () => {
    it("creates receipt and transfers funds", async () => {
      mockTx.lot.findUniqueOrThrow.mockResolvedValue(closedLot);
      mockTx.receipt.findUnique.mockResolvedValue(null);
      mockTx.wallet.findUniqueOrThrow
        .mockResolvedValueOnce({ id: "w-bidder", totalCents: 50000n, committedCents: 15000n })
        .mockResolvedValueOnce({ id: "w-auctioneer", totalCents: 0n, committedCents: 0n });
      mockTx.wallet.update.mockResolvedValue({});
      mockTx.walletLedgerEntry.create.mockResolvedValue({});
      const mockReceipt = {
        id: "receipt-1",
        lotId: "lot-1",
        winnerId: "bidder-1",
        amountCents: 15000n,
        publicToken: "tok-abc",
        finalChainHash: "abc123",
        signature: "sig",
        issuedAt: new Date(),
      };
      mockTx.receipt.create.mockResolvedValue(mockReceipt);
      mockTx.lot.update.mockResolvedValue({});

      const receipt = await svc.settleLot("lot-1");
      expect(receipt.winnerId).toBe("bidder-1");
      expect(mockTx.wallet.update).toHaveBeenCalledTimes(2);
      expect(mockTx.walletLedgerEntry.create).toHaveBeenCalledTimes(2);
    });

    it("returns existing receipt if already settled", async () => {
      mockTx.lot.findUniqueOrThrow.mockResolvedValue(closedLot);
      const existing = { id: "receipt-1", winnerId: "bidder-1" };
      mockTx.receipt.findUnique.mockResolvedValue(existing);

      const receipt = await svc.settleLot("lot-1");
      expect(receipt).toEqual(existing);
      expect(mockTx.wallet.update).not.toHaveBeenCalled();
    });

    it("throws when lot is not CLOSED", async () => {
      mockTx.lot.findUniqueOrThrow.mockResolvedValue({ ...closedLot, status: "LIVE" });
      await expect(svc.settleLot("lot-1")).rejects.toThrow("LOT_NOT_CLOSED");
    });

    it("throws and marks closedAt when lot has no bids (no winner)", async () => {
      mockTx.lot.findUniqueOrThrow.mockResolvedValue({
        ...closedLot,
        leadingBidderId: null,
        currentBidCents: null,
      });
      mockTx.receipt.findUnique.mockResolvedValue(null);
      mockTx.lot.update.mockResolvedValue({});
      await expect(svc.settleLot("lot-1")).rejects.toThrow("NO_WINNER");
      expect(mockTx.lot.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ closedAt: expect.any(Date) }) }),
      );
    });
  });

  describe("getReceiptByToken", () => {
    it("finds receipt by public token", async () => {
      const receipt = { id: "receipt-1", publicToken: "tok-abc", lotId: "lot-1" };
      mockPrisma.receipt.findUniqueOrThrow.mockResolvedValue(receipt);
      const result = await svc.getReceiptByToken("tok-abc");
      expect(result.publicToken).toBe("tok-abc");
    });
  });

  describe("getReceiptByLot", () => {
    it("returns receipt when exists", async () => {
      const receipt = { id: "receipt-1", lotId: "lot-1" };
      mockPrisma.receipt.findUnique.mockResolvedValue(receipt);
      const result = await svc.getReceiptByLot("lot-1");
      expect(result?.id).toBe("receipt-1");
    });

    it("returns null when no receipt", async () => {
      mockPrisma.receipt.findUnique.mockResolvedValue(null);
      const result = await svc.getReceiptByLot("lot-99");
      expect(result).toBeNull();
    });
  });
});
