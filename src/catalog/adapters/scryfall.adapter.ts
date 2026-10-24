import type { CatalogItem, CatalogProvider } from "../catalog.types";

const SCRYFALL_BASE = "https://api.scryfall.com";

interface ScryfallCard {
  id: string;
  name: string;
  oracle_text: string | null;
  image_uris?: { normal?: string };
  card_faces?: Array<{ image_uris?: { normal?: string } }>;
  set_name: string;
  type_line: string;
  rarity: string;
  cmc: number;
}

function toItem(c: ScryfallCard): CatalogItem {
  const imageUrl =
    c.image_uris?.normal ??
    c.card_faces?.[0]?.image_uris?.normal ??
    null;

  return {
    providerId: c.id,
    provider: "SCRYFALL",
    title: c.name,
    description: c.oracle_text ?? "",
    imageUrl,
    externalUrl: `https://scryfall.com/card/${c.id}`,
    metadata: {
      set: c.set_name,
      type: c.type_line,
      rarity: c.rarity,
      cmc: c.cmc,
    },
  };
}

export class ScryfallAdapter implements CatalogProvider {
  readonly providerKey = "SCRYFALL" as const;

  async search(query: string, page: number): Promise<CatalogItem[]> {
    const url = `${SCRYFALL_BASE}/cards/search?q=${encodeURIComponent(query)}&page=${page}`;
    const res = await fetch(url, { headers: { "User-Agent": "AuctionHouse/1.0" } });
    if (!res.ok) return [];
    const json = (await res.json()) as { data: ScryfallCard[] };
    return json.data.map(toItem);
  }

  async fetchById(id: string): Promise<CatalogItem> {
    const url = `${SCRYFALL_BASE}/cards/${id}`;
    const res = await fetch(url, { headers: { "User-Agent": "AuctionHouse/1.0" } });
    if (!res.ok) throw new Error(`Scryfall card ${id} not found`);
    const json = (await res.json()) as ScryfallCard;
    return toItem(json);
  }
}
