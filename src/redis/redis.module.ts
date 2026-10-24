import { Global, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";
import type { AppEnv } from "../config/env.schema";
import { REDIS_CLIENT } from "./redis.constants";

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppEnv, true>) => {
        return new Redis(config.get("REDIS_URL", { infer: true }));
      },
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule {}
