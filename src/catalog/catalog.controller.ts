import { BadRequestException, Controller, Get, Query } from "@nestjs/common";
import type { CatalogService } from "./catalog.service";

@Controller("catalog")
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  @Get("search")
  async search(@Query("q") q: string, @Query("provider") provider: string) {
    if (!q?.trim()) throw new BadRequestException("Query required");
    const validProviders = ["ART_INSTITUTE_CHICAGO", "SCRYFALL", "OPEN_LIBRARY"];
    if (!validProviders.includes(provider)) {
      throw new BadRequestException(`provider must be one of: ${validProviders.join(", ")}`);
    }
    const items = await this.catalogService.search(provider, q.trim(), 1);
    return { items };
  }
}
