import { Test } from "@nestjs/testing";
import { IdentityService } from "../auth/identity.service";
import { SessionGuard } from "../auth/session.guard";
import { BidsService } from "../bids/bids.service";
import { PrismaService } from "../prisma/prisma.service";
import { UsersController } from "./users.controller";

const passGuard = { canActivate: () => true };

const mockDbUser = {
  id: "user-1",
  name: "Demo Bidder",
  role: "BIDDER",
  encryptedEmail: "enc-email",
  encryptedFullName: "enc-name",
  createdAt: new Date("2024-01-01"),
};

const mockPrisma = {
  user: {
    findUniqueOrThrow: jest.fn(),
  },
  wallet: {
    findUnique: jest.fn(),
  },
};

const mockIdentity = {
  decrypt: jest.fn(),
};

const mockBids = {
  getMyBids: jest.fn(),
  getMyWins: jest.fn(),
};

describe("UsersController", () => {
  let ctrl: UsersController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        { provide: PrismaService, useValue: mockPrisma },
        { provide: IdentityService, useValue: mockIdentity },
        { provide: BidsService, useValue: mockBids },
      ],
    })
      .overrideGuard(SessionGuard)
      .useValue(passGuard)
      .compile();
    ctrl = module.get(UsersController);
  });

  describe("me", () => {
    const req = { user: { id: "user-1", name: "Demo Bidder" } } as never;

    it("returns masked email for long local part", async () => {
      mockPrisma.user.findUniqueOrThrow.mockResolvedValue(mockDbUser);
      mockIdentity.decrypt.mockReturnValue("bidder1@demo.com");
      const result = await ctrl.me(req);
      expect(result.maskedEmail).toBe("bidd***@demo.com");
      expect(result.role).toBe("BIDDER");
    });

    it("returns masked email for short local part (≤4 chars)", async () => {
      mockPrisma.user.findUniqueOrThrow.mockResolvedValue(mockDbUser);
      mockIdentity.decrypt.mockReturnValue("ab@demo.com");
      const result = await ctrl.me(req);
      expect(result.maskedEmail).toBe("ab@demo.com");
    });

    it("returns null maskedEmail when encryptedEmail missing", async () => {
      mockPrisma.user.findUniqueOrThrow.mockResolvedValue({ ...mockDbUser, encryptedEmail: null });
      const result = await ctrl.me(req);
      expect(result.maskedEmail).toBeNull();
    });

    it("returns null maskedEmail when decrypt throws (key rotation)", async () => {
      mockPrisma.user.findUniqueOrThrow.mockResolvedValue(mockDbUser);
      mockIdentity.decrypt.mockImplementation(() => {
        throw new Error("bad key");
      });
      const result = await ctrl.me(req);
      expect(result.maskedEmail).toBeNull();
    });

    it("handles email with no @ sign", async () => {
      mockPrisma.user.findUniqueOrThrow.mockResolvedValue(mockDbUser);
      mockIdentity.decrypt.mockReturnValue("noemail");
      const result = await ctrl.me(req);
      expect(result.maskedEmail).toBe("noem***");
    });
  });

  describe("myBids", () => {
    const req = { user: { id: "user-1" } } as never;

    it("returns paginated bids", async () => {
      mockBids.getMyBids.mockResolvedValue({
        items: [
          {
            id: "bid-1",
            lotId: "lot-1",
            amountCents: 1500n,
            sequence: 1,
            placedAt: new Date("2024-01-01"),
          },
        ],
        nextCursor: null,
      });
      const result = await ctrl.myBids(req);
      expect(result.items).toHaveLength(1);
      expect(result.items[0].amountCents).toBe("1500");
      expect(result.nextCursor).toBeNull();
    });

    it("passes cursor and limit", async () => {
      mockBids.getMyBids.mockResolvedValue({ items: [], nextCursor: null });
      await ctrl.myBids(req, "bid-0", 5);
      expect(mockBids.getMyBids).toHaveBeenCalledWith("user-1", "bid-0", 5);
    });
  });

  describe("myWins", () => {
    const req = { user: { id: "user-1" } } as never;

    it("returns wins with receiptToken", async () => {
      mockBids.getMyWins.mockResolvedValue([
        { lotId: "lot-1", amountCents: 20000n, receiptToken: "tok-abc" },
      ]);
      const result = await ctrl.myWins(req);
      expect(result).toHaveLength(1);
      expect(result[0].amountCents).toBe("20000");
      expect(result[0].receiptToken).toBe("tok-abc");
    });

    it("returns empty array when no wins", async () => {
      mockBids.getMyWins.mockResolvedValue([]);
      const result = await ctrl.myWins(req);
      expect(result).toHaveLength(0);
    });
  });

  describe("lgpdExport", () => {
    const req = { user: { id: "user-1" } } as never;

    it("returns full LGPD export with wallet and bids", async () => {
      mockPrisma.user.findUniqueOrThrow.mockResolvedValue(mockDbUser);
      mockPrisma.wallet.findUnique.mockResolvedValue({
        totalCents: 100000n,
        committedCents: 5000n,
      });
      mockIdentity.decrypt
        .mockReturnValueOnce("bidder1@demo.com")
        .mockReturnValueOnce("Demo Bidder");
      mockBids.getMyBids.mockResolvedValue({
        items: [{ id: "bid-1", lotId: "lot-1", amountCents: 1500n, placedAt: new Date() }],
        nextCursor: null,
      });
      mockBids.getMyWins.mockResolvedValue([{ lotId: "lot-1", amountCents: 1500n }]);

      const result = await ctrl.lgpdExport(req);
      expect(result.profile.email).toBe("bidder1@demo.com");
      expect(result.profile.name).toBe("Demo Bidder");
      expect(result.wallet?.totalCents).toBe("100000");
      expect(result.bids).toHaveLength(1);
      expect(result.bids[0].amountCents).toBe("1500");
    });

    it("returns null wallet when not found", async () => {
      mockPrisma.user.findUniqueOrThrow.mockResolvedValue(mockDbUser);
      mockPrisma.wallet.findUnique.mockResolvedValue(null);
      mockIdentity.decrypt.mockReturnValue("test@test.com");
      mockBids.getMyBids.mockResolvedValue({ items: [], nextCursor: null });
      mockBids.getMyWins.mockResolvedValue([]);

      const result = await ctrl.lgpdExport(req);
      expect(result.wallet).toBeNull();
    });

    it("handles decrypt error gracefully (key rotation)", async () => {
      mockPrisma.user.findUniqueOrThrow.mockResolvedValue(mockDbUser);
      mockPrisma.wallet.findUnique.mockResolvedValue(null);
      mockIdentity.decrypt.mockImplementation(() => {
        throw new Error("bad key");
      });
      mockBids.getMyBids.mockResolvedValue({ items: [], nextCursor: null });
      mockBids.getMyWins.mockResolvedValue([]);

      const result = await ctrl.lgpdExport(req);
      expect(result.profile.email).toBeNull();
      expect(result.profile.name).toBeNull();
    });
  });
});
