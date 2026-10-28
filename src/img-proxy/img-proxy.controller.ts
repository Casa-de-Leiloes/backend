import { createHash } from "node:crypto";
import { BadRequestException, Controller, Get, Headers, Query, Res } from "@nestjs/common";
import type { Response } from "express";

const ALLOWED_HOSTS = new Set([
  "images.metmuseum.org",
  "www.artic.edu",
  "upload.wikimedia.org",
  "thumb.wikimedia.org",
  "cards.scryfall.io",
  "c1.scryfall.com",
  "covers.openlibrary.org",
  "ia800107.us.archive.org",
]);

@Controller("img-proxy")
export class ImgProxyController {
  @Get()
  async proxy(
    @Query("url") rawUrl: string,
    @Res() res: Response,
    @Headers("if-none-match") ifNoneMatch?: string,
  ) {
    if (!rawUrl) throw new BadRequestException("url query param required");

    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      throw new BadRequestException("invalid url");
    }

    if (!ALLOWED_HOSTS.has(parsed.hostname)) {
      throw new BadRequestException("domain not allowed");
    }

    // ETag derived from URL — stable for same image URL
    const etag = `"${createHash("sha1").update(rawUrl).digest("hex").slice(0, 16)}"`;
    if (ifNoneMatch === etag) {
      res.status(304).end();
      return;
    }

    const fetchHeaders: Record<string, string> = {
      "User-Agent":
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "image/webp,image/apng,image/*,*/*;q=0.8",
      "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
      Referer: `${parsed.protocol}//${parsed.hostname}/`,
    };
    if (parsed.hostname === "www.artic.edu") {
      fetchHeaders["AIC-User-Agent"] = "AuctionHouse/1.0 (https://github.com/auction-house)";
    }
    const response = await fetch(rawUrl, { headers: fetchHeaders });

    if (!response.ok) {
      res.status(response.status).end();
      return;
    }

    const contentType = response.headers.get("content-type") ?? "image/jpeg";
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.setHeader("ETag", etag);

    const buf = await response.arrayBuffer();
    res.end(Buffer.from(buf));
  }
}
