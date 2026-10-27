import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { AuthModule } from "./auth/auth.module";
import { BidsModule } from "./bids/bids.module";
import { CatalogModule } from "./catalog/catalog.module";
import { validateEnv } from "./config/env.schema";
import { HealthModule } from "./health/health.module";
import { ImgProxyModule } from "./img-proxy/img-proxy.module";
import { LotsModule } from "./lots/lots.module";
import { PrismaModule } from "./prisma/prisma.module";
import { RedisModule } from "./redis/redis.module";
import { UsersModule } from "./users/users.module";
import { WalletModule } from "./wallet/wallet.module";

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
    ImgProxyModule,
  ],
})
export class AppModule {}
