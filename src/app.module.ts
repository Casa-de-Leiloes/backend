import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { validateEnv } from "./config/env.schema";
import { AuthModule } from "./auth/auth.module";
import { HealthModule } from "./health/health.module";
import { PrismaModule } from "./prisma/prisma.module";
import { RedisModule } from "./redis/redis.module";
import { WalletModule } from "./wallet/wallet.module";
import { CatalogModule } from "./catalog/catalog.module";
import { LotsModule } from "./lots/lots.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    RedisModule,
    PrismaModule,
    AuthModule,
    WalletModule,
    CatalogModule,
    LotsModule,
    HealthModule,
  ],
})
export class AppModule {}
