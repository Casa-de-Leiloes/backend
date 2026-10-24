import { ScryfallAdapter } from "./scryfall.adapter";

const mockFetch = jest.fn();
global.fetch = mockFetch;

const scryfallCard = {
  id: "abc-123",
  name: "Black Lotus",
  oracle_text: "Add three mana of any single color.",
  image_uris: { normal: "https://cards.scryfall.io/normal/abc-123.jpg" },
  set_name: "Limited Edition Alpha",
  type_line: "Artifact",
  rarity: "rare",
  cmc: 0,
};

describe("ScryfallAdapter", () => {
  let adapter: ScryfallAdapter;

  beforeEach(() => {
    mockFetch.mockClear();
    adapter = new ScryfallAdapter();
  });

  it("search maps Scryfall response to CatalogItem array", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ data: [scryfallCard], total_cards: 1, has_more: false }),
    });

    const results = await adapter.search("Black Lotus", 1);
    expect(results).toHaveLength(1);
    expect(results[0].provider).toBe("SCRYFALL");
    expect(results[0].providerId).toBe("abc-123");
    expect(results[0].title).toBe("Black Lotus");
    expect(results[0].imageUrl).toBe("https://cards.scryfall.io/normal/abc-123.jpg");
  });

  it("search returns empty array when no results", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ object: "error", code: "not_found" }),
    });
    const results = await adapter.search("xyznotacard", 1);
    expect(results).toEqual([]);
  });

  it("fetchById returns single CatalogItem", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => scryfallCard,
    });

    const item = await adapter.fetchById("abc-123");
    expect(item.providerId).toBe("abc-123");
    expect(item.provider).toBe("SCRYFALL");
    expect(item.metadata.set).toBe("Limited Edition Alpha");
  });

  it("fetchById throws on 404", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 404 });
    await expect(adapter.fetchById("bad-id")).rejects.toThrow("Scryfall card bad-id not found");
  });
});
