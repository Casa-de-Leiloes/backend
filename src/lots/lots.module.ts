import { Module } from "@nestjs/common";
import { LotsService } from "./lots.service";
import { LotsController } from "./lots.controller";
import { AuthModule } from "../auth/auth.module";
import { CatalogModule } from "../catalog/catalog.module";

@Module({
  imports: [AuthModule, CatalogModule],
  providers: [LotsService],
  controllers: [LotsController],
  exports: [LotsService],
})
export class LotsModule {}
