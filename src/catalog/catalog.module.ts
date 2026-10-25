import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { PrismaService } from "../prisma/prisma.service";
import { AicAdapter } from "./adapters/aic.adapter";
import { OpenLibraryAdapter } from "./adapters/open-library.adapter";
import { ScryfallAdapter } from "./adapters/scryfall.adapter";
import { CatalogController } from "./catalog.controller";
import { CatalogService } from "./catalog.service";

@Module({
  imports: [PrismaModule],
  controllers: [CatalogController],
  providers: [
    CatalogService,
    AicAdapter,
    ScryfallAdapter,
    OpenLibraryAdapter,
    {
      provide: "PRISMA_SERVICE",
      inject: [PrismaService],
      useFactory: (p: PrismaService) => p,
    },
  ],
  exports: [CatalogService],
})
export class CatalogModule {}
