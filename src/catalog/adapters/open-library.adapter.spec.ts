import { OpenLibraryAdapter } from "./open-library.adapter";

const mockFetch = jest.fn();
global.fetch = mockFetch;

const openLibraryDoc = {
  key: "/works/OL82563W",
  title: "The Hobbit",
  author_name: ["J.R.R. Tolkien"],
  first_publish_year: 1937,
  subject: ["Fantasy", "Adventure"],
  cover_i: 8406786,
};

describe("OpenLibraryAdapter", () => {
  let adapter: OpenLibraryAdapter;

  beforeEach(() => {
    mockFetch.mockClear();
    adapter = new OpenLibraryAdapter();
  });

  it("search maps Open Library response to CatalogItem array", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ docs: [openLibraryDoc], numFound: 1 }),
    });

    const results = await adapter.search("Hobbit", 1);
    expect(results).toHaveLength(1);
    expect(results[0].provider).toBe("OPEN_LIBRARY");
    expect(results[0].providerId).toBe("OL82563W");
    expect(results[0].title).toBe("The Hobbit");
    expect(results[0].imageUrl).toContain("8406786");
  });

  it("search returns empty array when no results", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ docs: [], numFound: 0 }),
    });
    const results = await adapter.search("xyz", 1);
    expect(results).toEqual([]);
  });

  it("fetchById returns single CatalogItem", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        key: "/works/OL82563W",
        title: "The Hobbit",
        description: { value: "A fantasy novel" },
        covers: [8406786],
      }),
    });

    const item = await adapter.fetchById("OL82563W");
    expect(item.providerId).toBe("OL82563W");
    expect(item.provider).toBe("OPEN_LIBRARY");
    expect(item.description).toBe("A fantasy novel");
  });

  it("fetchById throws on 404", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 404 });
    await expect(adapter.fetchById("OLBADID")).rejects.toThrow(
      "Open Library work OLBADID not found",
    );
  });
});
