import type { PrismaClient } from "@prisma/client";
import * as argon2 from "argon2";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { IdentityService } from "./identity.service";

export function createBetterAuth(
  prisma: PrismaClient,
  identity: IdentityService,
  config: {
    secret: string;
    baseUrl: string;
    frontendOrigin: string;
  },
) {
  return betterAuth({
    secret: config.secret,
    baseURL: config.baseUrl,
    trustedOrigins: [config.frontendOrigin],
    database: prismaAdapter(prisma, { provider: "postgresql" }),
    emailAndPassword: {
      enabled: true,
      password: {
        async hash(password: string) {
          return argon2.hash(password, { type: argon2.argon2id });
        },
        async verify({ hash, password }: { hash: string; password: string }) {
          return argon2.verify(hash, password);
        },
      },
    },
    user: {
      additionalFields: {
        role: {
          type: "string",
          required: true,
          input: true,
          returned: true,
        },
        encryptedEmail: {
          type: "string",
          required: false,
          input: false,
          defaultValue: "",
        },
        encryptedFullName: {
          type: "string",
          required: false,
          input: false,
          defaultValue: "",
        },
      },
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            const rawEmail: string =
              ((user as unknown as Record<string, unknown>)._rawEmail as string) ?? user.email;
            return {
              data: {
                ...user,
                encryptedEmail: identity.encrypt(rawEmail),
                encryptedFullName: identity.encrypt(user.name ?? ""),
                email: identity.aliasEmail(rawEmail),
              },
            };
          },
          after: async (user) => {
            const role = (user as unknown as Record<string, unknown>).role as string | undefined;
            if (role === "BIDDER") {
              await prisma.wallet.create({
                data: { userId: user.id, totalCents: 0n, committedCents: 0n },
              });
            }
          },
        },
      },
    },
    advanced: {
      cookiePrefix: "auction",
    },
  });
}

export type BetterAuthInstance = ReturnType<typeof createBetterAuth>;
