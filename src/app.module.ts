import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ConfigModule } from "@nestjs/config";
import { ThrottlerModule, ThrottlerGuard } from "@nestjs/throttler";
import { validateEnv } from "./config/env.schema";
import { AuthModule } from "./auth/auth.module";
import { HealthModule } from "./health/health.module";
import { PrismaModule } from "./prisma/prisma.module";
import { RedisModule } from "./redis/redis.module";
import { WalletModule } from "./wallet/wallet.module";
import { CatalogModule } from "./catalog/catalog.module";
import { LotsModule } from "./lots/lots.module";
import { BidsModule } from "./bids/bids.module";
import { UsersModule } from "./users/users.module";

@Module({
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    ThrottlerModule.forRoot([
      { name: "short", ttl: 1000, limit: 10 },
      { name: "medium", ttl: 60_000, limit: 200 },
    ]),
    RedisModule,
    PrismaModule,
    AuthModule,
    WalletModule,
    CatalogModule,
    LotsModule,
    BidsModule,
    UsersModule,
    HealthModule,
  ],
})
export class AppModule {}
