import "dotenv/config";
import { createCipheriv, createHash, createHmac, randomBytes } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import argon2 from "argon2";

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
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL required");
  const fernetKeys = (process.env.FERNET_KEYS ?? "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
  const emailLookupKey = process.env.EMAIL_LOOKUP_KEY ?? "";
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

  for (const [email, idx] of [
    [bidder1Email, 1],
    [bidder2Email, 2],
  ] as [string, number][]) {
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

  // ── Met Museum API helpers ────────────────────────────────────────────────
  const MET_BASE = "https://collectionapi.metmuseum.org/public/collection/v1/objects";

  interface MetArtwork {
    objectID: number;
    title: string;
    artistDisplayName: string;
    objectDate: string;
    medium: string;
    primaryImage: string;
    primaryImageSmall: string;
    department: string;
    isPublicDomain: boolean;
  }

  async function fetchMetArtwork(id: number): Promise<MetArtwork | null> {
    try {
      const r = await fetch(`${MET_BASE}/${id}`, {
        headers: { "User-Agent": "AuctionHouse/1.0" },
        signal: AbortSignal.timeout(10_000),
      });
      if (!r.ok) return null;
      return (await r.json()) as MetArtwork;
    } catch {
      return null;
    }
  }
  // ─────────────────────────────────────────────────────────────────────────

  // Lot configurations — objectID references Met Museum collection
  const LOT_CONFIGS: Array<{
    id: string;
    metId: number;
    status: "LIVE" | "SCHEDULED" | "CLOSED";
    offsetMs: number;
    startingBidCents: bigint;
    lotCategory:
      | "FINE_ART"
      | "JEWELRY"
      | "WATCHES"
      | "ANTIQUITIES"
      | "NUMISMATICS"
      | "FASHION"
      | "VEHICLES"
      | "BOOKS"
      | "WINE"
      | "OTHER";
  }> = [
    {
      id: "seed-lot-1",
      metId: 436535,
      status: "LIVE",
      offsetMs: 0,
      startingBidCents: 100000n,
      lotCategory: "FINE_ART",
    }, // Wheat Field with Cypresses — Van Gogh
    {
      id: "seed-lot-2",
      metId: 437881,
      status: "LIVE",
      offsetMs: 0,
      startingBidCents: 80000n,
      lotCategory: "FINE_ART",
    }, // Young Woman with Water Pitcher — Vermeer
    {
      id: "seed-lot-3",
      metId: 45434,
      status: "SCHEDULED",
      offsetMs: 2 * 3_600_000,
      startingBidCents: 50000n,
      lotCategory: "FINE_ART",
    }, // Under the Wave off Kanagawa — Hokusai
    {
      id: "seed-lot-4",
      metId: 11417,
      status: "SCHEDULED",
      offsetMs: 5 * 3_600_000,
      startingBidCents: 120000n,
      lotCategory: "FINE_ART",
    }, // Washington Crossing — Leutze
    {
      id: "seed-lot-5",
      metId: 437980,
      status: "SCHEDULED",
      offsetMs: 8 * 3_600_000,
      startingBidCents: 90000n,
      lotCategory: "FINE_ART",
    }, // Cypresses — Van Gogh
    {
      id: "seed-lot-6",
      metId: 436121,
      status: "SCHEDULED",
      offsetMs: 24 * 3_600_000,
      startingBidCents: 75000n,
      lotCategory: "FINE_ART",
    }, // Woman Seated beside Vase — Degas
    {
      id: "seed-lot-7",
      metId: 437984,
      status: "SCHEDULED",
      offsetMs: 48 * 3_600_000,
      startingBidCents: 60000n,
      lotCategory: "FINE_ART",
    }, // La Berceuse — Van Gogh
    {
      id: "seed-lot-8",
      metId: 436529,
      status: "CLOSED",
      offsetMs: -3 * 3_600_000,
      startingBidCents: 85000n,
      lotCategory: "FINE_ART",
    }, // L'Arlésienne — Van Gogh
    {
      id: "seed-lot-9",
      metId: 10481,
      status: "CLOSED",
      offsetMs: -6 * 3_600_000,
      startingBidCents: 70000n,
      lotCategory: "FINE_ART",
    }, // Heart of the Andes — Church
  ];

  console.log(`Fetching ${LOT_CONFIGS.length} artworks from Met Museum API...`);
  const snapshotByLotId = new Map<string, { id: string; title: string }>();
  for (const cfg of LOT_CONFIGS) {
    const artwork = await fetchMetArtwork(cfg.metId);
    if (!artwork?.isPublicDomain) {
      console.warn(`  ${cfg.metId} not found or not public domain, skipping ${cfg.id}`);
      continue;
    }
    const sourceImageUrl = artwork.primaryImage || undefined;
    console.log(`  ${artwork.title.slice(0, 40)}: ${sourceImageUrl ? "✓" : "✗"}`);
    const snap = await prisma.catalogItemSnapshot.upsert({
      where: {
        provider_externalId: { provider: "ART_INSTITUTE_CHICAGO", externalId: String(cfg.metId) },
      },
      create: {
        provider: "ART_INSTITUTE_CHICAGO",
        externalId: String(cfg.metId),
        title: artwork.title,
        attributes: {
          artist: artwork.artistDisplayName || null,
          date: artwork.objectDate || null,
          medium: artwork.medium || null,
        },
        ...(sourceImageUrl ? { sourceImageUrl } : {}),
      },
      update: {
        title: artwork.title,
        ...(sourceImageUrl ? { sourceImageUrl } : {}),
      },
    });
    snapshotByLotId.set(cfg.id, { id: snap.id, title: artwork.title });
  }

  // seed-lot-1 snapshot reference (used for bid seeding below)
  const lot1Snap = snapshotByLotId.get("seed-lot-1");
  if (!lot1Snap) throw new Error("seed-lot-1 artwork missing from Met Museum API response");
  const snapshot = { id: lot1Snap.id };

  const now = new Date();
  const startsAt = new Date(now.getTime() - 600_000); // started 10 min ago
  const endsAt = new Date(now.getTime() + 3_600_000); // ends in 1 hour

  const auditSigningKey = process.env.AUDIT_SIGNING_KEY ?? "seed-signing-key";

  function hashBidEntry(
    lotId: string,
    sequence: number,
    bidderId: string,
    amountCents: bigint,
    prevHash: string | null,
  ): string {
    const payload = [
      lotId,
      `${lotId}-${sequence}`,
      bidderId,
      amountCents.toString(),
      prevHash ?? "genesis",
    ].join("|");
    return createHash("sha256").update(payload).digest("hex");
  }

  function signHash(hash: string): string {
    return createHmac("sha256", auditSigningKey).update(hash).digest("hex");
  }

  const lot1SnapRef = snapshotByLotId.get("seed-lot-1");
  if (!lot1SnapRef) throw new Error("seed-lot-1 artwork missing from Met Museum response");
  const lot = await prisma.lot.upsert({
    where: { id: "seed-lot-1" },
    create: {
      id: "seed-lot-1",
      auctioneerId: auctioneer.id,
      snapshotId: snapshot.id,
      title: lot1SnapRef.title,
      description: "From the Met Museum open-access collection. Public domain.",
      category: "ART_INSTITUTE_CHICAGO",
      lotCategory: "FINE_ART",
      startingBidCents: 100000n,
      minIncrementCents: 5000n,
      startsAt,
      endsAt,
      originalEndsAt: endsAt,
      status: "LIVE",
    },
    update: { status: "LIVE", endsAt, startsAt, lotCategory: "FINE_ART", snapshotId: snapshot.id },
  });

  // Seed bids if none exist yet
  const existingBidCount = await prisma.bid.count({ where: { lotId: lot.id } });
  if (existingBidCount === 0) {
    const bidder1Id = "seed-bidder-1";
    const bidder2Id = "seed-bidder-2";
    const lotId = lot.id;

    const hash1 = hashBidEntry(lotId, 1, bidder1Id, 150000n, null);
    const sig1 = signHash(hash1);
    await prisma.bid.create({
      data: {
        lotId,
        bidderId: bidder1Id,
        sequence: 1,
        amountCents: 150000n,
        previousHash: "genesis",
        hash: hash1,
        signature: sig1,
      },
    });

    const hash2 = hashBidEntry(lotId, 2, bidder2Id, 160000n, hash1);
    const sig2 = signHash(hash2);
    await prisma.bid.create({
      data: {
        lotId,
        bidderId: bidder2Id,
        sequence: 2,
        amountCents: 160000n,
        previousHash: hash1,
        hash: hash2,
        signature: sig2,
      },
    });

    // Update lot with chain state
    await prisma.lot.update({
      where: { id: lotId },
      data: {
        currentBidCents: 160000n,
        leadingBidderId: bidder2Id,
        chainHeadHash: hash2,
        chainHeadSignature: sig2,
        bidCount: 2,
      },
    });

    // Commit bidder2's wallet (they are leading)
    await prisma.wallet.update({
      where: { userId: bidder2Id },
      data: { committedCents: 160000n },
    });
  }

  // ── Remaining lots from Met Museum data ──────────────────────────────────
  for (const cfg of LOT_CONFIGS.filter((c) => c.id !== "seed-lot-1")) {
    const snapRef = snapshotByLotId.get(cfg.id);
    if (!snapRef) continue;

    const lotStartsAt =
      cfg.status === "CLOSED"
        ? new Date(now.getTime() + cfg.offsetMs - 3_600_000)
        : new Date(now.getTime() + cfg.offsetMs);
    const lotEndsAt =
      cfg.status === "CLOSED"
        ? new Date(now.getTime() + cfg.offsetMs)
        : new Date(now.getTime() + cfg.offsetMs + 4 * 3_600_000);

    await prisma.lot.upsert({
      where: { id: cfg.id },
      create: {
        id: cfg.id,
        auctioneerId: auctioneer.id,
        snapshotId: snapRef.id,
        title: snapRef.title,
        description: "From the Met Museum open-access collection. Public domain.",
        category: "ART_INSTITUTE_CHICAGO",
        lotCategory: cfg.lotCategory,
        startingBidCents: cfg.startingBidCents,
        minIncrementCents: 5000n,
        startsAt: lotStartsAt,
        endsAt: lotEndsAt,
        originalEndsAt: lotEndsAt,
        status: cfg.status,
        ...(cfg.status === "CLOSED" ? { closedAt: lotEndsAt } : {}),
      },
      update: {
        status: cfg.status,
        lotCategory: cfg.lotCategory,
        snapshotId: snapRef.id,
        title: snapRef.title,
      },
    });
  }
  // ── End lots ──────────────────────────────────────────────────────────────

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
