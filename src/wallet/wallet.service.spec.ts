import { Test } from "@nestjs/testing";
import { WalletService } from "./wallet.service";
import { PrismaService } from "../prisma/prisma.service";

const mockWallet = {
  id: "wallet-1",
  userId: "user-1",
  totalCents: 10000n,
  committedCents: 3000n,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockPrisma = {
  wallet: {
    findUniqueOrThrow: jest.fn(),
    update: jest.fn(),
  },
  walletLedgerEntry: {
    create: jest.fn(),
    findMany: jest.fn(),
  },
  $transaction: jest.fn(),
};

describe("WalletService", () => {
  let svc: WalletService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        WalletService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    svc = module.get(WalletService);
  });

  describe("getBalance", () => {
    it("returns available and committed cents", async () => {
      mockPrisma.wallet.findUniqueOrThrow.mockResolvedValue(mockWallet);
      const balance = await svc.getBalance("user-1");
      expect(balance.totalCents).toBe(10000n);
      expect(balance.committedCents).toBe(3000n);
      expect(balance.availableCents).toBe(7000n);
    });

    it("throws if wallet not found", async () => {
      mockPrisma.wallet.findUniqueOrThrow.mockRejectedValue(new Error("Not found"));
      await expect(svc.getBalance("ghost")).rejects.toThrow();
    });
  });

  describe("deposit", () => {
    it("adds to totalCents and writes ledger entry", async () => {
      const updated = { ...mockWallet, totalCents: 15000n };
      mockPrisma.$transaction.mockImplementation(async (fn: (tx: typeof mockPrisma) => Promise<unknown>) => fn(mockPrisma));
      mockPrisma.wallet.update.mockResolvedValue(updated);
      mockPrisma.walletLedgerEntry.create.mockResolvedValue({});

      const result = await svc.deposit("wallet-1", 5000n);
      expect(result.totalCents).toBe(15000n);
      expect(mockPrisma.walletLedgerEntry.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ kind: "DEPOSIT", amountCents: 5000n, walletId: "wallet-1" }),
        }),
      );
    });

    it("rejects zero or negative deposit", async () => {
      await expect(svc.deposit("wallet-1", 0n)).rejects.toThrow("positive");
      await expect(svc.deposit("wallet-1", -100n)).rejects.toThrow("positive");
    });
  });

  describe("commit / release", () => {
    it("commit moves available to committed", async () => {
      const updated = { ...mockWallet, committedCents: 5000n };
      mockPrisma.$transaction.mockImplementation(async (fn: (tx: typeof mockPrisma) => Promise<unknown>) => fn(mockPrisma));
      mockPrisma.wallet.findUniqueOrThrow.mockResolvedValue(mockWallet);
      mockPrisma.wallet.update.mockResolvedValue(updated);
      mockPrisma.walletLedgerEntry.create.mockResolvedValue({});

      await svc.commit("wallet-1", 2000n, "lot-1");
      expect(mockPrisma.wallet.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ committedCents: { increment: 2000n } }),
        }),
      );
    });

    it("commit throws when insufficient available balance", async () => {
      mockPrisma.$transaction.mockImplementation(async (fn: (tx: typeof mockPrisma) => Promise<unknown>) => fn(mockPrisma));
      mockPrisma.wallet.findUniqueOrThrow.mockResolvedValue(mockWallet); // available = 7000n
      await expect(svc.commit("wallet-1", 8000n, "lot-1")).rejects.toThrow("INSUFFICIENT_BALANCE");
    });

    it("release decrements committedCents", async () => {
      mockPrisma.$transaction.mockImplementation(async (fn: (tx: typeof mockPrisma) => Promise<unknown>) => fn(mockPrisma));
      mockPrisma.wallet.findUniqueOrThrow.mockResolvedValue(mockWallet);
      mockPrisma.wallet.update.mockResolvedValue(mockWallet);
      mockPrisma.walletLedgerEntry.create.mockResolvedValue({});

      await svc.release("wallet-1", 1000n, "lot-1");
      expect(mockPrisma.wallet.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ committedCents: { decrement: 1000n } }),
        }),
      );
    });
  });

  describe("getLedger", () => {
    it("returns entries ordered by createdAt desc", async () => {
      const entries = [
        { id: "e1", walletId: "wallet-1", kind: "DEPOSIT", amountCents: 5000n, lotId: null, bidId: null, createdAt: new Date() },
      ];
      mockPrisma.walletLedgerEntry.findMany.mockResolvedValue(entries);
      const result = await svc.getLedger("wallet-1", 10, undefined);
      expect(result).toEqual(entries);
      expect(mockPrisma.walletLedgerEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { createdAt: "desc" } }),
      );
    });
  });
});
