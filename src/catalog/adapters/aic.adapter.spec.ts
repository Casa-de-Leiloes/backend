import { AicAdapter } from "./aic.adapter";

const mockFetch = jest.fn();
global.fetch = mockFetch;

const aicArtwork = {
  id: 129884,
  title: "A Sunday on La Grande Jatte",
  description: "Seurat's pointillist masterpiece",
  image_id: "2d484387-2509-5e8e-2c43-22f0ccea1517",
  artist_display: "Georges Seurat",
  date_display: "1884–86",
  medium_display: "Oil on canvas",
  dimensions: "207.5 × 308.1 cm",
};

describe("AicAdapter", () => {
  let adapter: AicAdapter;

  beforeEach(() => {
    mockFetch.mockClear();
    adapter = new AicAdapter();
  });

  it("search maps AIC response to CatalogItem array", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ data: [aicArtwork], pagination: { total: 1 } }),
    });

    const results = await adapter.search("Seurat", 1);
    expect(results).toHaveLength(1);
    expect(results[0].provider).toBe("ART_INSTITUTE_CHICAGO");
    expect(results[0].providerId).toBe("129884");
    expect(results[0].title).toBe("A Sunday on La Grande Jatte");
    expect(results[0].imageUrl).toContain("2d484387");
  });

  it("search returns empty array on 404", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 404, json: async () => ({}) });
    const results = await adapter.search("notfound", 1);
    expect(results).toEqual([]);
  });

  it("fetchById returns single CatalogItem", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ data: aicArtwork }),
    });

    const item = await adapter.fetchById("129884");
    expect(item.providerId).toBe("129884");
    expect(item.provider).toBe("ART_INSTITUTE_CHICAGO");
    expect(item.metadata.artist).toBe("Georges Seurat");
  });

  it("fetchById throws on 404", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 404 });
    await expect(adapter.fetchById("000")).rejects.toThrow("AIC item 000 not found");
  });
});
