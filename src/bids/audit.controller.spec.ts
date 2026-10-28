import { NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { AuditController } from "./audit.controller";
import { BidsService } from "./bids.service";

const makeBid = (seq: number, prevHash: string | null) => ({
  id: `bid-${seq}`,
  lotId: "lot-1",
  bidderId: "user-1",
  sequence: seq,
  amountCents: BigInt(1000 + seq * 100),
  hash: `hash-${seq}`,
  previousHash: prevHash ?? "genesis",
  signature: `sig-${seq}`,
  placedAt: new Date(),
});

const mockBidsService = {
  getBidsForLot: jest.fn(),
};

describe("AuditController", () => {
  let ctrl: AuditController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      controllers: [AuditController],
      providers: [{ provide: BidsService, useValue: mockBidsService }],
    }).compile();
    ctrl = module.get(AuditController);
  });

  it("throws NotFoundException when no bids for lot", async () => {
    mockBidsService.getBidsForLot.mockResolvedValue([]);
    await expect(ctrl.auditLot("lot-1")).rejects.toThrow(NotFoundException);
  });

  it("returns audit result with chain validity", async () => {
    const bids = [makeBid(1, null), makeBid(2, "hash-1"), makeBid(3, "hash-2")];
    mockBidsService.getBidsForLot.mockResolvedValue(bids);

    const result = await ctrl.auditLot("lot-1");
    expect(result.lotId).toBe("lot-1");
    expect(result.bidCount).toBe(3);
    expect(typeof result.chainValid).toBe("boolean");
    expect(result.firstHash).toBe("hash-1");
    expect(result.lastHash).toBe("hash-3");
  });

  it("returns single bid audit", async () => {
    const bids = [makeBid(1, null)];
    mockBidsService.getBidsForLot.mockResolvedValue(bids);
    const result = await ctrl.auditLot("lot-1");
    expect(result.bidCount).toBe(1);
    expect(result.firstHash).toBe(result.lastHash);
  });
});
