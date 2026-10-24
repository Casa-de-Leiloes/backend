import type { CatalogItem, CatalogProvider } from "../catalog.types";

const OL_BASE = "https://openlibrary.org";
const OL_COVER = "https://covers.openlibrary.org/b/id";

interface OpenLibraryDoc {
  key: string;
  title: string;
  author_name?: string[];
  first_publish_year?: number;
  subject?: string[];
  cover_i?: number;
}

interface OpenLibraryWork {
  key: string;
  title: string;
  description?: string | { value: string };
  covers?: number[];
  subjects?: string[];
}

function workId(key: string): string {
  return key.replace("/works/", "");
}

function docToItem(d: OpenLibraryDoc): CatalogItem {
  const id = workId(d.key);
  return {
    providerId: id,
    provider: "OPEN_LIBRARY",
    title: d.title,
    description: d.subject?.slice(0, 3).join(", ") ?? "",
    imageUrl: d.cover_i ? `${OL_COVER}/${d.cover_i}-L.jpg` : null,
    externalUrl: `${OL_BASE}${d.key}`,
    metadata: {
      author: d.author_name?.[0] ?? null,
      firstPublishYear: d.first_publish_year ?? null,
    },
  };
}

export class OpenLibraryAdapter implements CatalogProvider {
  readonly providerKey = "OPEN_LIBRARY" as const;

  async search(query: string, page: number): Promise<CatalogItem[]> {
    const offset = (page - 1) * 20;
    const url = `${OL_BASE}/search.json?q=${encodeURIComponent(query)}&limit=20&offset=${offset}`;
    const res = await fetch(url, { headers: { "User-Agent": "AuctionHouse/1.0" } });
    if (!res.ok) return [];
    const json = (await res.json()) as { docs: OpenLibraryDoc[]; numFound: number };
    return json.docs.map(docToItem);
  }

  async fetchById(id: string): Promise<CatalogItem> {
    const url = `${OL_BASE}/works/${id}.json`;
    const res = await fetch(url, { headers: { "User-Agent": "AuctionHouse/1.0" } });
    if (!res.ok) throw new Error(`Open Library work ${id} not found`);
    const w = (await res.json()) as OpenLibraryWork;
    const desc =
      typeof w.description === "string"
        ? w.description
        : (w.description?.value ?? "");
    return {
      providerId: workId(w.key),
      provider: "OPEN_LIBRARY",
      title: w.title,
      description: desc,
      imageUrl: w.covers?.[0] ? `${OL_COVER}/${w.covers[0]}-L.jpg` : null,
      externalUrl: `${OL_BASE}${w.key}`,
      metadata: { subjects: w.subjects?.slice(0, 5).join(", ") ?? null },
    };
  }
}
