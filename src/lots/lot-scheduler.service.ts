import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { type Job, Queue, Worker } from "bullmq";
import type Redis from "ioredis";
import { PrismaService } from "../prisma/prisma.service";
import { REDIS_CLIENT } from "../redis/redis.constants";
import { SettlementService } from "../settlement/settlement.service";

const QUEUE_NAME = "lot-lifecycle";

interface LotJobData {
  lotId: string;
  action: "open" | "close";
}

@Injectable()
export class LotSchedulerService implements OnModuleInit, OnModuleDestroy {
  private queue!: Queue<LotJobData>;
  private worker!: Worker<LotJobData>;

  constructor(
    @Inject(REDIS_CLIENT) readonly _redis: Redis,
    private readonly prisma: PrismaService,
    private readonly settlementService: SettlementService,
  ) {}

  async onModuleInit() {
    const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
    const connection = { url: redisUrl, maxRetriesPerRequest: null as null };
    this.queue = new Queue<LotJobData>(QUEUE_NAME, { connection });

    // Catch-up: close any LIVE/SCHEDULED lots whose time has already passed
    await this.catchUpExpiredLots();

    this.worker = new Worker<LotJobData>(
      QUEUE_NAME,
      async (job: Job<LotJobData>) => {
        const { lotId, action } = job.data;
        if (action === "open") {
          await this.prisma.lot.updateMany({
            where: { id: lotId, status: "SCHEDULED" },
            data: { status: "LIVE" },
          });
        } else if (action === "close") {
          await this.prisma.lot.updateMany({
            where: { id: lotId, status: "LIVE" },
            data: { status: "CLOSED" },
          });
          try {
            await this.settlementService.settleLot(lotId);
          } catch {
            // no bids — lot already marked closed
          }
        }
      },
      { connection, autorun: true },
    );
  }

  async onModuleDestroy() {
    await this.worker.close();
    await this.queue.close();
  }

  private async catchUpExpiredLots(): Promise<void> {
    const now = new Date();

    // Open SCHEDULED lots whose startsAt has passed
    await this.prisma.lot.updateMany({
      where: { status: "SCHEDULED", startsAt: { lte: now }, endsAt: { gt: now } },
      data: { status: "LIVE" },
    });

    // Close LIVE lots (and SCHEDULED lots) whose endsAt has passed
    const expired = await this.prisma.lot.findMany({
      where: { status: { in: ["LIVE", "SCHEDULED"] }, endsAt: { lte: now } },
      select: { id: true },
    });

    for (const lot of expired) {
      await this.prisma.lot.updateMany({
        where: { id: lot.id, status: { in: ["LIVE", "SCHEDULED"] } },
        data: { status: "CLOSED" },
      });
      try {
        await this.settlementService.settleLot(lot.id);
      } catch {
        // no bids or already settled
      }
    }
  }

  async scheduleLot(lotId: string, startsAt: Date, endsAt: Date): Promise<void> {
    const now = Date.now();
    const openDelay = Math.max(0, startsAt.getTime() - now);
    const closeDelay = Math.max(0, endsAt.getTime() - now);

    await this.queue.add(
      "open",
      { lotId, action: "open" },
      { delay: openDelay, jobId: `open-${lotId}` },
    );
    await this.queue.add(
      "close",
      { lotId, action: "close" },
      { delay: closeDelay, jobId: `close-${lotId}` },
    );
  }

  async rescheduleClose(lotId: string, endsAt: Date): Promise<void> {
    const job = await this.queue.getJob(`close-${lotId}`);
    if (job) await job.remove();
    const delay = Math.max(0, endsAt.getTime() - Date.now());
    await this.queue.add("close", { lotId, action: "close" }, { delay, jobId: `close-${lotId}` });
  }
}
