import { Module } from "@nestjs/common";
import { CatalogService } from "./catalog.service";
import { AicAdapter } from "./adapters/aic.adapter";
import { ScryfallAdapter } from "./adapters/scryfall.adapter";
import { OpenLibraryAdapter } from "./adapters/open-library.adapter";
import { PrismaModule } from "../prisma/prisma.module";
import { PrismaService } from "../prisma/prisma.service";

@Module({
  imports: [PrismaModule],
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
