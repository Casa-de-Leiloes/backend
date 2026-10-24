import { Module } from "@nestjs/common";
import { UsersController } from "./users.controller";
import { BidsModule } from "../bids/bids.module";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [BidsModule, AuthModule],
  controllers: [UsersController],
})
export class UsersModule {}
