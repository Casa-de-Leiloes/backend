import { Module } from "@nestjs/common";
import { BidsService } from "./bids.service";
import { BidsController } from "./bids.controller";
import { AuditController } from "./audit.controller";
import { WalletModule } from "../wallet/wallet.module";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [WalletModule, AuthModule],
  providers: [BidsService],
  controllers: [BidsController, AuditController],
  exports: [BidsService],
})
export class BidsModule {}
