import { Controller, Get } from "@nestjs/common";
import type Redis from "ioredis";
import { InjectRedis } from "../redis/inject-redis.decorator";

@Controller("health")
export class HealthController {
  constructor(@InjectRedis() private readonly redis: Redis) {}

  @Get("live")
  liveness(): { status: string } {
    return { status: "ok" };
  }

  @Get("ready")
  async readiness(): Promise<{ status: string; checks: Record<string, string> }> {
    const redisPong = await this.redis.ping();
    const redisStatus = redisPong === "PONG" ? "ok" : "error";

    return {
      status: redisStatus === "ok" ? "ok" : "error",
      checks: {
        redis: redisStatus,
      },
    };
  }
}
