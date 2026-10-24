import { Test, type TestingModule } from "@nestjs/testing";
import { REDIS_CLIENT } from "../redis/redis.constants";
import { HealthController } from "./health.controller";

describe("HealthController", () => {
  let controller: HealthController;
  const mockRedis = { ping: jest.fn().mockResolvedValue("PONG") };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: REDIS_CLIENT,
          useValue: mockRedis,
        },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
    mockRedis.ping.mockClear();
  });

  describe("GET /health/live", () => {
    it("returns status ok without any external call", () => {
      const result = controller.liveness();
      expect(result).toEqual({ status: "ok" });
      expect(mockRedis.ping).not.toHaveBeenCalled();
    });
  });

  describe("GET /health/ready", () => {
    it("returns ok when Redis responds with PONG", async () => {
      mockRedis.ping.mockResolvedValue("PONG");
      const result = await controller.readiness();
      expect(result.status).toBe("ok");
      expect(result.checks.redis).toBe("ok");
    });

    it("returns error when Redis does not respond with PONG", async () => {
      mockRedis.ping.mockResolvedValue("ERROR");
      const result = await controller.readiness();
      expect(result.status).toBe("error");
      expect(result.checks.redis).toBe("error");
    });
  });
});
