import { Controller, Get, Param, NotFoundException } from "@nestjs/common";
import { BidsService } from "./bids.service";
import { verifyBidChain } from "./bid-chain";

@Controller("lots/:lotId/audit")
export class AuditController {
  constructor(private readonly bidsService: BidsService) {}

  @Get()
  async auditLot(@Param("lotId") lotId: string) {
    const bids = await this.bidsService.getBidsForLot(lotId);
    if (bids.length === 0) throw new NotFoundException(`No bids for lot ${lotId}`);

    const valid = verifyBidChain(bids);
    return {
      lotId,
      bidCount: bids.length,
      chainValid: valid,
      firstHash: bids[0]?.hash ?? null,
      lastHash: bids[bids.length - 1]?.hash ?? null,
    };
  }
}
