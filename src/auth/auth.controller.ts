import { All, Controller, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import type { AuthService } from "./auth.service";
import type { IdentityService } from "./identity.service";

@Controller("auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly identityService: IdentityService,
  ) {}

  @All("*path")
  async handleAuth(@Req() req: Request, @Res() res: Response): Promise<void> {
    const host = req.headers.host ?? "localhost";
    const protocol = req.headers["x-forwarded-proto"] ?? (req.secure ? "https" : "http");
    const fullUrl = `${protocol}://${host}${req.originalUrl}`;

    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (Array.isArray(value)) {
        for (const v of value) headers.append(key, v);
      } else if (value !== undefined) {
        headers.set(key, value);
      }
    }

    let bodyPayload = req.body as Record<string, unknown> | undefined;
    if (this.isSignInRequest(req) && typeof bodyPayload?.email === "string") {
      bodyPayload = {
        ...bodyPayload,
        email: this.identityService.aliasEmail(bodyPayload.email),
      };
    }

    const body =
      req.method !== "GET" && req.method !== "HEAD" ? JSON.stringify(bodyPayload) : undefined;

    const fetchReq = new Request(fullUrl, { method: req.method, headers, body });
    const response = await this.authService.handler(fetchReq);
    const resBody = await response.text();

    res.status(response.status);
    response.headers.forEach((value, key) => {
      if (key.toLowerCase() !== "set-cookie") {
        res.setHeader(key, value);
      }
    });
    const setCookies = response.headers.getSetCookie?.() ?? [];
    if (setCookies.length > 0) {
      res.setHeader("Set-Cookie", setCookies);
    }
    res.send(resBody);
  }

  private isSignInRequest(req: Request): boolean {
    return req.method === "POST" && req.path.endsWith("/sign-in/email");
  }
}
