import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { LotsModule } from "../lots/lots.module";
import { WalletModule } from "../wallet/wallet.module";
import { AuditController } from "./audit.controller";
import { BidsController } from "./bids.controller";
import { BidsService } from "./bids.service";

@Module({
  imports: [WalletModule, AuthModule, LotsModule],
  providers: [BidsService],
  controllers: [BidsController, AuditController],
  exports: [BidsService],
})
export class BidsModule {}
