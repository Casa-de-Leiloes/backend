import {
  BadRequestException,
  Controller,
  Get,
  Query,
  Res,
} from "@nestjs/common";
import type { Response } from "express";

const ALLOWED_HOSTS = new Set([
  "images.metmuseum.org",
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
  async proxy(@Query("url") rawUrl: string, @Res() res: Response) {
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

    const response = await fetch(rawUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "image/webp,image/apng,image/*,*/*;q=0.8",
        "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
        Referer: `${parsed.protocol}//${parsed.hostname}/`,
        "sec-ch-ua":
          '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"Linux"',
        "sec-fetch-dest": "image",
        "sec-fetch-mode": "no-cors",
        "sec-fetch-site": "same-origin",
      },
    });

    if (!response.ok) {
      res.status(response.status).end();
      return;
    }

    const contentType = response.headers.get("content-type") ?? "image/jpeg";
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=86400");

    const buf = await response.arrayBuffer();
    res.end(Buffer.from(buf));
  }
}
