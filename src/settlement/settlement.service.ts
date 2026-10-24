import { createHmac, randomBytes } from "node:crypto";
import { Injectable } from "@nestjs/common";
import type { Receipt } from "@prisma/client";
import type { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class SettlementService {
  private readonly signingKey: string;

  constructor(private readonly prisma: PrismaService) {
    this.signingKey = process.env.AUDIT_SIGNING_KEY ?? "";
  }

  async settleLot(lotId: string): Promise<Receipt> {
    return this.prisma.$transaction(async (tx) => {
      const lot = await tx.lot.findUniqueOrThrow({
        where: { id: lotId },
        include: { auctioneer: true },
      });

      if (lot.status !== "CLOSED") {
        throw new Error(`LOT_NOT_CLOSED: lot ${lotId} has status ${lot.status}`);
      }

      if (!lot.leadingBidderId || !lot.currentBidCents) {
        await tx.lot.update({ where: { id: lotId }, data: { closedAt: new Date() } });
        throw new Error("NO_WINNER: lot closed with no bids");
      }

      const existingReceipt = await tx.receipt.findUnique({ where: { lotId } });
      if (existingReceipt) return existingReceipt;

      const publicToken = randomBytes(16).toString("hex");
      const signature = createHmac("sha256", this.signingKey)
        .update(`${lotId}|${lot.leadingBidderId}|${lot.currentBidCents}|${publicToken}`)
        .digest("hex");

      const winnerWallet = await tx.wallet.findUniqueOrThrow({
        where: { userId: lot.leadingBidderId },
      });
      const auctioneerWallet = await tx.wallet.findUniqueOrThrow({
        where: { userId: lot.auctioneerId },
      });

      await tx.wallet.update({
        where: { id: winnerWallet.id },
        data: {
          totalCents: { decrement: lot.currentBidCents },
          committedCents: { decrement: lot.currentBidCents },
        },
      });
      await tx.walletLedgerEntry.create({
        data: {
          walletId: winnerWallet.id,
          kind: "SETTLEMENT_DEBIT",
          amountCents: lot.currentBidCents,
          lotId,
        },
      });

      await tx.wallet.update({
        where: { id: auctioneerWallet.id },
        data: { totalCents: { increment: lot.currentBidCents } },
      });
      await tx.walletLedgerEntry.create({
        data: {
          walletId: auctioneerWallet.id,
          kind: "SETTLEMENT_CREDIT",
          amountCents: lot.currentBidCents,
          lotId,
        },
      });

      const receipt = await tx.receipt.create({
        data: {
          lotId,
          winnerId: lot.leadingBidderId,
          auctioneerId: lot.auctioneerId,
          amountCents: lot.currentBidCents,
          finalChainHash: lot.chainHeadHash ?? "",
          publicToken,
          signature,
        },
      });

      await tx.lot.update({ where: { id: lotId }, data: { closedAt: new Date() } });

      return receipt;
    });
  }

  async getReceiptByToken(publicToken: string): Promise<Receipt> {
    return this.prisma.receipt.findUniqueOrThrow({ where: { publicToken } });
  }

  async getReceiptByLot(lotId: string): Promise<Receipt | null> {
    return this.prisma.receipt.findUnique({ where: { lotId } });
  }
}
