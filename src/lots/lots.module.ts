import { Module } from "@nestjs/common";
import { LotsService } from "./lots.service";
import { LotsController } from "./lots.controller";
import { LotSchedulerService } from "./lot-scheduler.service";
import { AuthModule } from "../auth/auth.module";
import { CatalogModule } from "../catalog/catalog.module";
import { SettlementModule } from "../settlement/settlement.module";

@Module({
  imports: [AuthModule, CatalogModule, SettlementModule],
  providers: [LotsService, LotSchedulerService],
  controllers: [LotsController],
  exports: [LotsService, LotSchedulerService],
})
export class LotsModule {}
