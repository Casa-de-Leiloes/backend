import { Module } from "@nestjs/common";
import { UsersController } from "./users.controller";
import { BidsModule } from "../bids/bids.module";
import { AuthModule } from "../auth/auth.module";
import { PrismaModule } from "../prisma/prisma.module";

@Module({
  imports: [BidsModule, AuthModule, PrismaModule],
  controllers: [UsersController],
})
export class UsersModule {}
