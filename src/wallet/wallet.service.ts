import { BadRequestException, Injectable } from "@nestjs/common";
import type { WalletLedgerEntry } from "@prisma/client";
import { LedgerEntryKind } from "@prisma/client";
import type { PrismaService } from "../prisma/prisma.service";

export interface WalletBalance {
  totalCents: bigint;
  committedCents: bigint;
  availableCents: bigint;
}

@Injectable()
export class WalletService {
  constructor(private readonly prisma: PrismaService) {}

  async getWalletByUserId(userId: string) {
    return this.prisma.wallet.findUniqueOrThrow({ where: { userId } });
  }

  async getBalance(userId: string): Promise<WalletBalance> {
    const wallet = await this.getWalletByUserId(userId);
    return {
      totalCents: wallet.totalCents,
      committedCents: wallet.committedCents,
      availableCents: wallet.totalCents - wallet.committedCents,
    };
  }

  async deposit(walletId: string, amountCents: bigint): Promise<WalletBalance & { id: string }> {
    if (amountCents <= 0n) throw new BadRequestException("Deposit must be positive");
    return this.prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.update({
        where: { id: walletId },
        data: { totalCents: { increment: amountCents } },
      });
      await tx.walletLedgerEntry.create({
        data: { walletId, kind: LedgerEntryKind.DEPOSIT, amountCents },
      });
      return {
        id: wallet.id,
        totalCents: wallet.totalCents,
        committedCents: wallet.committedCents,
        availableCents: wallet.totalCents - wallet.committedCents,
      };
    });
  }

  async commit(walletId: string, amountCents: bigint, lotId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.findUniqueOrThrow({ where: { id: walletId } });
      const available = wallet.totalCents - wallet.committedCents;
      if (amountCents > available) {
        throw new BadRequestException("INSUFFICIENT_BALANCE");
      }
      await tx.wallet.update({
        where: { id: walletId },
        data: { committedCents: { increment: amountCents } },
      });
      await tx.walletLedgerEntry.create({
        data: { walletId, kind: LedgerEntryKind.COMMIT, amountCents, lotId },
      });
    });
  }

  async release(walletId: string, amountCents: bigint, lotId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.wallet.findUniqueOrThrow({ where: { id: walletId } });
      await tx.wallet.update({
        where: { id: walletId },
        data: { committedCents: { decrement: amountCents } },
      });
      await tx.walletLedgerEntry.create({
        data: { walletId, kind: LedgerEntryKind.RELEASE, amountCents, lotId },
      });
    });
  }

  async getLedger(
    walletId: string,
    limit: number,
    cursor: string | undefined,
  ): Promise<WalletLedgerEntry[]> {
    return this.prisma.walletLedgerEntry.findMany({
      where: { walletId },
      orderBy: { createdAt: "desc" },
      take: limit,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
  }
}
