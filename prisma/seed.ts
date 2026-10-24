import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import argon2 from "argon2";
import { createHmac, createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from "node:crypto";

const FERNET_VERSION = 0x80;

function fernetEncrypt(plain: string, keyBase64: string): string {
  const raw = Buffer.from(keyBase64, "base64url");
  const sigKey = raw.subarray(0, 16);
  const encKey = raw.subarray(16, 32);
  const iv = randomBytes(16);
  const ts = Buffer.alloc(8);
  ts.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 1000)));
  const cipher = createCipheriv("aes-128-cbc", encKey, iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const header = Buffer.concat([Buffer.from([FERNET_VERSION]), ts, iv]);
  const payload = Buffer.concat([header, ct]);
  const hmac = createHmac("sha256", sigKey).update(payload).digest();
  return Buffer.concat([payload, hmac]).toString("base64url");
}

function blindIndex(email: string, lookupKey: string): string {
  return createHmac("sha256", lookupKey).update(email.toLowerCase().trim()).digest("hex");
}

function aliasEmail(email: string, lookupKey: string): string {
  return `${blindIndex(email, lookupKey)}@users.invalid`;
}

async function main() {
  const databaseUrl = process.env["DATABASE_URL"];
  if (!databaseUrl) throw new Error("DATABASE_URL required");
  const fernetKeys = (process.env["FERNET_KEYS"] ?? "").split(",").map((k) => k.trim()).filter(Boolean);
  const emailLookupKey = process.env["EMAIL_LOOKUP_KEY"] ?? "";
  const fernetKey = fernetKeys[0];
  if (!fernetKey) throw new Error("FERNET_KEYS required");

  const adapter = new PrismaPg({ connectionString: databaseUrl });
  const prisma = new PrismaClient({ adapter });

  console.log("Seeding database...");

  const auctioneerPassword = await argon2.hash("Password123!", { type: argon2.argon2id });
  const bidderPassword = await argon2.hash("Password123!", { type: argon2.argon2id });

  const auctioneerEmail = "auctioneer@demo.com";
  const bidder1Email = "bidder1@demo.com";
  const bidder2Email = "bidder2@demo.com";

  const auctioneer = await prisma.user.upsert({
    where: { id: "seed-auctioneer" },
    create: {
      id: "seed-auctioneer",
      name: "Demo Auctioneer",
      email: aliasEmail(auctioneerEmail, emailLookupKey),
      emailVerified: true,
      role: "AUCTIONEER",
      encryptedEmail: fernetEncrypt(auctioneerEmail, fernetKey),
      encryptedFullName: fernetEncrypt("Demo Auctioneer", fernetKey),
    },
    update: {},
  });

  await prisma.account.upsert({
    where: { id: "seed-auctioneer-account" },
    create: {
      id: "seed-auctioneer-account",
      accountId: auctioneer.id,
      providerId: "credential",
      userId: auctioneer.id,
      password: auctioneerPassword,
    },
    update: {},
  });

  for (const [email, idx] of [[bidder1Email, 1], [bidder2Email, 2]] as [string, number][]) {
    const bidderId = `seed-bidder-${idx}`;
    await prisma.user.upsert({
      where: { id: bidderId },
      create: {
        id: bidderId,
        name: `Demo Bidder ${idx}`,
        email: aliasEmail(email, emailLookupKey),
        emailVerified: true,
        role: "BIDDER",
        encryptedEmail: fernetEncrypt(email, fernetKey),
        encryptedFullName: fernetEncrypt(`Demo Bidder ${idx}`, fernetKey),
      },
      update: {},
    });
    await prisma.account.upsert({
      where: { id: `seed-bidder-${idx}-account` },
      create: {
        id: `seed-bidder-${idx}-account`,
        accountId: bidderId,
        providerId: "credential",
        userId: bidderId,
        password: bidderPassword,
      },
      update: {},
    });
    await prisma.wallet.upsert({
      where: { userId: bidderId },
      create: { userId: bidderId, totalCents: 500000n, committedCents: 0n },
      update: {},
    });
  }

  const snapshot = await prisma.catalogItemSnapshot.upsert({
    where: { provider_externalId: { provider: "ART_INSTITUTE_CHICAGO", externalId: "129884" } },
    create: {
      provider: "ART_INSTITUTE_CHICAGO",
      externalId: "129884",
      title: "A Sunday on La Grande Jatte — 1884",
      attributes: { artist: "Georges Seurat", date: "1884–86", medium: "Oil on canvas" },
      sourceImageUrl: "https://www.artic.edu/iiif/2/2d484387-2509-5e8e-2c43-22f0ccea1517/full/843,/0/default.jpg",
    },
    update: {},
  });

  const now = new Date();
  const startsAt = new Date(now.getTime() + 60_000);
  const endsAt = new Date(now.getTime() + 3_600_000);

  await prisma.lot.upsert({
    where: { id: "seed-lot-1" },
    create: {
      id: "seed-lot-1",
      auctioneerId: auctioneer.id,
      snapshotId: snapshot.id,
      title: "A Sunday on La Grande Jatte",
      description: "Georges Seurat's iconic pointillist painting from the Art Institute of Chicago.",
      category: "ART_INSTITUTE_CHICAGO",
      startingBidCents: 100000n,
      minIncrementCents: 5000n,
      startsAt,
      endsAt,
      originalEndsAt: endsAt,
      status: "SCHEDULED",
    },
    update: {},
  });

  console.log("Seeding complete!");
  console.log("  Auctioneer: auctioneer@demo.com / Password123!");
  console.log("  Bidder 1:   bidder1@demo.com / Password123!");
  console.log("  Bidder 2:   bidder2@demo.com / Password123!");

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
