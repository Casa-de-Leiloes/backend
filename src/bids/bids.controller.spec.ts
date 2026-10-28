import { BadRequestException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { RolesGuard } from "../auth/roles.guard";
import { SessionGuard } from "../auth/session.guard";
import { WalletService } from "../wallet/wallet.service";
import { BidsController } from "./bids.controller";
import { BidsService } from "./bids.service";

const passGuard = { canActivate: () => true };

const mockBidsService = {
  placeBid: jest.fn(),
  getBidsForLot: jest.fn(),
  getPseudonym: jest.fn(),
};

const mockWalletService = {
  getWalletByUserId: jest.fn(),
};

describe("BidsController", () => {
  let ctrl: BidsController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      controllers: [BidsController],
      providers: [
        { provide: BidsService, useValue: mockBidsService },
        { provide: WalletService, useValue: mockWalletService },
      ],
    })
      .overrideGuard(SessionGuard)
      .useValue(passGuard)
      .overrideGuard(RolesGuard)
      .useValue(passGuard)
      .compile();
    ctrl = module.get(BidsController);
  });

  describe("placeBid", () => {
    const req = { user: { id: "user-1" } } as never;

    it("places a bid and returns payload", async () => {
      mockWalletService.getWalletByUserId.mockResolvedValue({ id: "w-1" });
      mockBidsService.placeBid.mockResolvedValue({
        id: "bid-1",
        amountCents: 1500n,
        sequence: 1,
        placedAt: new Date("2024-01-01T00:00:00Z"),
      });

      const result = await ctrl.placeBid("lot-1", req, { amountCents: 1500 });
      expect(result.bidId).toBe("bid-1");
      expect(result.amountCents).toBe("1500");
      expect(result.sequence).toBe(1);
    });

    it("throws BadRequest on invalid body", async () => {
      await expect(ctrl.placeBid("lot-1", req, { amountCents: -100 })).rejects.toThrow(
        BadRequestException,
      );
    });

    it("throws BadRequest when amountCents missing", async () => {
      await expect(ctrl.placeBid("lot-1", req, {})).rejects.toThrow(BadRequestException);
    });
  });

  describe("getBids", () => {
    it("returns bids with pseudonyms", async () => {
      mockBidsService.getBidsForLot.mockResolvedValue([
        { id: "bid-1", sequence: 1, amountCents: 1500n, placedAt: new Date(), bidderId: "user-1" },
        { id: "bid-2", sequence: 2, amountCents: 2000n, placedAt: new Date(), bidderId: "user-2" },
      ]);
      mockBidsService.getPseudonym.mockImplementation((id: string) => `anon-${id.slice(-1)}`);

      const result = await ctrl.getBids("lot-1");
      expect(result).toHaveLength(2);
      expect(result[0].amountCents).toBe("1500");
      expect(result[0].pseudonym).toBe("anon-1");
      expect(result[1].pseudonym).toBe("anon-2");
    });

    it("returns empty array when no bids", async () => {
      mockBidsService.getBidsForLot.mockResolvedValue([]);
      const result = await ctrl.getBids("lot-1");
      expect(result).toHaveLength(0);
    });
  });
});
