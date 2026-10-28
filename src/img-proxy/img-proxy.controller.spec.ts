import { BadRequestException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { ImgProxyController } from "./img-proxy.controller";

const makeRes = () => ({
  status: jest.fn().mockReturnThis(),
  end: jest.fn().mockReturnThis(),
  setHeader: jest.fn(),
});

const mockFetch = jest.fn();

describe("ImgProxyController", () => {
  let ctrl: ImgProxyController;

  beforeEach(async () => {
    jest.clearAllMocks();
    global.fetch = mockFetch;
    const module = await Test.createTestingModule({
      controllers: [ImgProxyController],
    }).compile();
    ctrl = module.get(ImgProxyController);
  });

  it("throws BadRequest when url param missing", async () => {
    const res = makeRes();
    await expect(ctrl.proxy("" as string, res as never)).rejects.toThrow(BadRequestException);
  });

  it("throws BadRequest when url is not a valid URL", async () => {
    const res = makeRes();
    await expect(ctrl.proxy("not-a-url", res as never)).rejects.toThrow(BadRequestException);
  });

  it("throws BadRequest when domain is not allowed", async () => {
    const res = makeRes();
    await expect(ctrl.proxy("https://evil.com/img.jpg", res as never)).rejects.toThrow(
      BadRequestException,
    );
  });

  it("returns 304 when ETag matches", async () => {
    const res = makeRes();
    const url = "https://images.metmuseum.org/test.jpg";
    // Compute expected ETag
    const { createHash } = await import("node:crypto");
    const etag = `"${createHash("sha1").update(url).digest("hex").slice(0, 16)}"`;
    await ctrl.proxy(url, res as never, etag);
    expect(res.status).toHaveBeenCalledWith(304);
    expect(res.end).toHaveBeenCalled();
  });

  it("proxies image from allowed domain", async () => {
    const res = makeRes();
    const url = "https://images.metmuseum.org/test.jpg";
    const mockBuffer = new ArrayBuffer(4);
    mockFetch.mockResolvedValue({
      ok: true,
      headers: { get: () => "image/jpeg" },
      arrayBuffer: async () => mockBuffer,
    });

    await ctrl.proxy(url, res as never);
    expect(res.setHeader).toHaveBeenCalledWith("Content-Type", "image/jpeg");
    expect(res.setHeader).toHaveBeenCalledWith("Cache-Control", "public, max-age=31536000, immutable");
    expect(res.end).toHaveBeenCalled();
  });

  it("returns upstream error status when fetch fails", async () => {
    const res = makeRes();
    const url = "https://images.metmuseum.org/notfound.jpg";
    mockFetch.mockResolvedValue({ ok: false, status: 404 });

    await ctrl.proxy(url, res as never);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.end).toHaveBeenCalled();
  });

  it("adds AIC-User-Agent header for artic.edu", async () => {
    const res = makeRes();
    const url = "https://www.artic.edu/iiif/2/test/full/843/0/default.jpg";
    const mockBuffer = new ArrayBuffer(4);
    mockFetch.mockResolvedValue({
      ok: true,
      headers: { get: () => "image/jpeg" },
      arrayBuffer: async () => mockBuffer,
    });

    await ctrl.proxy(url, res as never);
    const fetchCall = mockFetch.mock.calls[0];
    expect(fetchCall[1].headers["AIC-User-Agent"]).toBeDefined();
  });

  it("uses allowed domains: artic.edu, wikimedia, scryfall, openlibrary", async () => {
    const allowedUrls = [
      "https://www.artic.edu/img.jpg",
      "https://upload.wikimedia.org/img.jpg",
      "https://thumb.wikimedia.org/img.jpg",
      "https://cards.scryfall.io/img.jpg",
      "https://c1.scryfall.com/img.jpg",
      "https://covers.openlibrary.org/img.jpg",
      "https://ia800107.us.archive.org/img.jpg",
    ];
    const mockBuffer = new ArrayBuffer(4);
    mockFetch.mockResolvedValue({
      ok: true,
      headers: { get: () => "image/jpeg" },
      arrayBuffer: async () => mockBuffer,
    });
    for (const url of allowedUrls) {
      const res = makeRes();
      await expect(ctrl.proxy(url, res as never)).resolves.not.toThrow();
    }
  });
});
