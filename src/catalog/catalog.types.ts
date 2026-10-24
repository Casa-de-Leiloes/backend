export interface CatalogItem {
  providerId: string;
  provider: "ART_INSTITUTE_CHICAGO" | "SCRYFALL" | "OPEN_LIBRARY";
  title: string;
  description: string;
  imageUrl: string | null;
  externalUrl: string | null;
  metadata: Record<string, string | number | boolean | null>;
}

export interface CatalogProvider {
  readonly providerKey: CatalogItem["provider"];
  search(query: string, page: number): Promise<CatalogItem[]>;
  fetchById(id: string): Promise<CatalogItem>;
}
