import { Test } from "@nestjs/testing";
import { PrismaService } from "../prisma/prisma.service";
import { REDIS_CLIENT } from "../redis/redis.constants";
import { SettlementService } from "../settlement/settlement.service";
import { LotSchedulerService } from "./lot-scheduler.service";

const mockAdd = jest.fn().mockResolvedValue({ id: "job-1" });
const mockGetJob = jest.fn();
const mockQueueClose = jest.fn().mockResolvedValue(undefined);
const mockWorkerClose = jest.fn().mockResolvedValue(undefined);

let workerJobHandler: ((job: { data: { lotId: string; action: string } }) => Promise<void>) | null =
  null;

jest.mock("bullmq", () => ({
  Queue: jest.fn().mockImplementation(() => ({
    add: mockAdd,
    close: mockQueueClose,
    getJob: mockGetJob,
  })),
  Worker: jest
    .fn()
    .mockImplementation(
      (
        _name: string,
        handler: (job: { data: { lotId: string; action: string } }) => Promise<void>,
      ) => {
        workerJobHandler = handler;
        return { close: mockWorkerClose };
      },
    ),
}));

const mockPrisma = {
  lot: {
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    findMany: jest.fn().mockResolvedValue([]),
  },
};

const mockSettlement = {
  settleLot: jest.fn().mockResolvedValue({}),
};

const mockRedis = {};

describe("LotSchedulerService", () => {
  let svc: LotSchedulerService;

  beforeEach(async () => {
    jest.clearAllMocks();
    workerJobHandler = null;
    mockPrisma.lot.findMany.mockResolvedValue([]);

    const module = await Test.createTestingModule({
      providers: [
        LotSchedulerService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SettlementService, useValue: mockSettlement },
        { provide: REDIS_CLIENT, useValue: mockRedis },
      ],
    }).compile();

    svc = module.get(LotSchedulerService);
    await svc.onModuleInit();
  });

  afterEach(async () => {
    await svc.onModuleDestroy();
  });

  describe("onModuleInit", () => {
    it("runs catchUp: opens SCHEDULED lots past startsAt", async () => {
      expect(mockPrisma.lot.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: "SCHEDULED" }),
          data: { status: "LIVE" },
        }),
      );
    });

    it("settles expired lots found in catchUp", async () => {
      const expiredLotId = "lot-expired";
      mockPrisma.lot.findMany.mockResolvedValue([{ id: expiredLotId }]);
      // Re-init to trigger catchUp with this mock
      await svc.onModuleInit();
      expect(mockSettlement.settleLot).toHaveBeenCalledWith(expiredLotId);
    });

    it("silently swallows settlement errors in catchUp", async () => {
      mockPrisma.lot.findMany.mockResolvedValue([{ id: "lot-no-bids" }]);
      mockSettlement.settleLot.mockRejectedValueOnce(new Error("NO_WINNER"));
      await expect(svc.onModuleInit()).resolves.not.toThrow();
    });
  });

  describe("onModuleDestroy", () => {
    it("closes worker and queue", async () => {
      await svc.onModuleDestroy();
      expect(mockWorkerClose).toHaveBeenCalled();
      expect(mockQueueClose).toHaveBeenCalled();
    });
  });

  describe("scheduleLot", () => {
    it("adds open and close jobs to the queue", async () => {
      const startsAt = new Date(Date.now() + 60_000);
      const endsAt = new Date(Date.now() + 3_600_000);
      await svc.scheduleLot("lot-new", startsAt, endsAt);
      expect(mockAdd).toHaveBeenCalledWith(
        "open",
        { lotId: "lot-new", action: "open" },
        expect.objectContaining({ jobId: "open-lot-new" }),
      );
      expect(mockAdd).toHaveBeenCalledWith(
        "close",
        { lotId: "lot-new", action: "close" },
        expect.objectContaining({ jobId: "close-lot-new" }),
      );
    });

    it("uses delay=0 for lots that already started/ended", async () => {
      const pastTime = new Date(Date.now() - 10_000);
      await svc.scheduleLot("lot-past", pastTime, pastTime);
      const openCall = mockAdd.mock.calls.find((c: unknown[]) => (c[0] as string) === "open");
      const closeCall = mockAdd.mock.calls.find((c: unknown[]) => (c[0] as string) === "close");
      expect((openCall?.[2] as { delay: number })?.delay).toBe(0);
      expect((closeCall?.[2] as { delay: number })?.delay).toBe(0);
    });
  });

  describe("rescheduleClose", () => {
    it("removes existing job and re-adds with new delay", async () => {
      const mockJob = { remove: jest.fn().mockResolvedValue(undefined) };
      mockGetJob.mockResolvedValue(mockJob);
      const newEndsAt = new Date(Date.now() + 5_000_000);
      await svc.rescheduleClose("lot-1", newEndsAt);
      expect(mockJob.remove).toHaveBeenCalled();
      expect(mockAdd).toHaveBeenCalledWith(
        "close",
        { lotId: "lot-1", action: "close" },
        expect.objectContaining({ jobId: "close-lot-1" }),
      );
    });

    it("skips remove when no existing job", async () => {
      mockGetJob.mockResolvedValue(null);
      const newEndsAt = new Date(Date.now() + 5_000_000);
      await svc.rescheduleClose("lot-2", newEndsAt);
      expect(mockAdd).toHaveBeenCalledWith(
        "close",
        expect.objectContaining({ lotId: "lot-2" }),
        expect.anything(),
      );
    });
  });

  describe("worker job handler", () => {
    it("opens SCHEDULED lot on open action", async () => {
      expect(workerJobHandler).not.toBeNull();
      await workerJobHandler!({ data: { lotId: "lot-1", action: "open" } });
      expect(mockPrisma.lot.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "lot-1", status: "SCHEDULED" },
          data: { status: "LIVE" },
        }),
      );
    });

    it("closes LIVE lot and settles on close action", async () => {
      await workerJobHandler!({ data: { lotId: "lot-1", action: "close" } });
      expect(mockPrisma.lot.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "lot-1", status: "LIVE" },
          data: { status: "CLOSED" },
        }),
      );
      expect(mockSettlement.settleLot).toHaveBeenCalledWith("lot-1");
    });

    it("swallows settlement errors on close action", async () => {
      mockSettlement.settleLot.mockRejectedValueOnce(new Error("NO_WINNER"));
      await expect(
        workerJobHandler!({ data: { lotId: "lot-no-bids", action: "close" } }),
      ).resolves.not.toThrow();
    });
  });
});
