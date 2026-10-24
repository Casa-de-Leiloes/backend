import type { CatalogItem, CatalogProvider } from "../catalog.types";

const AIC_BASE = "https://api.artic.edu/api/v1";
const AIC_IMAGE_BASE = "https://www.artic.edu/iiif/2";
const FIELDS = "id,title,description,image_id,artist_display,date_display,medium_display,dimensions";

interface AicArtwork {
  id: number;
  title: string;
  description: string | null;
  image_id: string | null;
  artist_display: string | null;
  date_display: string | null;
  medium_display: string | null;
  dimensions: string | null;
}

function toItem(a: AicArtwork): CatalogItem {
  return {
    providerId: String(a.id),
    provider: "ART_INSTITUTE_CHICAGO",
    title: a.title,
    description: a.description ?? "",
    imageUrl: a.image_id ? `${AIC_IMAGE_BASE}/${a.image_id}/full/843,/0/default.jpg` : null,
    externalUrl: `https://www.artic.edu/artworks/${a.id}`,
    metadata: {
      artist: a.artist_display ?? null,
      date: a.date_display ?? null,
      medium: a.medium_display ?? null,
      dimensions: a.dimensions ?? null,
    },
  };
}

export class AicAdapter implements CatalogProvider {
  readonly providerKey = "ART_INSTITUTE_CHICAGO" as const;

  async search(query: string, page: number): Promise<CatalogItem[]> {
    const url = `${AIC_BASE}/artworks/search?q=${encodeURIComponent(query)}&fields=${FIELDS}&page=${page}&limit=20`;
    const res = await fetch(url, { headers: { "AIC-User-Agent": "AuctionHouse/1.0" } });
    if (!res.ok) return [];
    const json = (await res.json()) as { data: AicArtwork[] };
    return json.data.map(toItem);
  }

  async fetchById(id: string): Promise<CatalogItem> {
    const url = `${AIC_BASE}/artworks/${id}?fields=${FIELDS}`;
    const res = await fetch(url, { headers: { "AIC-User-Agent": "AuctionHouse/1.0" } });
    if (!res.ok) throw new Error(`AIC item ${id} not found`);
    const json = (await res.json()) as { data: AicArtwork };
    return toItem(json.data);
  }
}
