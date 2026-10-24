import { Module } from "@nestjs/common";
import { BidsService } from "./bids.service";
import { WalletModule } from "../wallet/wallet.module";

@Module({
  imports: [WalletModule],
  providers: [BidsService],
  exports: [BidsService],
})
export class BidsModule {}
