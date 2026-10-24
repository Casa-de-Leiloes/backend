import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Request } from "express";
import type { AppEnv } from "../config/env.schema";
import { PrismaService } from "../prisma/prisma.service";
import { createBetterAuth, type BetterAuthInstance } from "./better-auth.config";
import { IdentityService } from "./identity.service";

@Injectable()
export class AuthService {
  private readonly auth: BetterAuthInstance;

  constructor(
    prisma: PrismaService,
    identity: IdentityService,
    config: ConfigService<AppEnv, true>,
  ) {
    this.auth = createBetterAuth(prisma, identity, {
      secret: config.get("BETTER_AUTH_SECRET", { infer: true }),
      baseUrl: config.get("BETTER_AUTH_URL", { infer: true }),
      frontendOrigin: config.get("FRONTEND_ORIGIN", { infer: true }),
    });
  }

  get handler() {
    return this.auth.handler;
  }

  async getSession(req: Request) {
    return this.auth.api.getSession({ headers: new Headers(req.headers as HeadersInit) });
  }
}
