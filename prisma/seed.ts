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

  const snapshot = await prisma.catalogItemSnapshot.upsert({
    where: { provider_externalId: { provider: "ART_INSTITUTE_CHICAGO", externalId: "129884" } },
    create: {
      provider: "ART_INSTITUTE_CHICAGO",
      externalId: "129884",
      title: "A Sunday on La Grande Jatte — 1884",
      attributes: { artist: "Georges Seurat", date: "1884–86", medium: "Oil on canvas" },
      sourceImageUrl: "/images/la-grande-jatte.svg",
    },
    update: { sourceImageUrl: "/images/la-grande-jatte.svg" },
  });

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

  const lot = await prisma.lot.upsert({
    where: { id: "seed-lot-1" },
    create: {
      id: "seed-lot-1",
      auctioneerId: auctioneer.id,
      snapshotId: snapshot.id,
      title: "A Sunday on La Grande Jatte — 1884",
      description:
        "Georges Seurat's iconic pointillist painting from the Art Institute of Chicago.",
      category: "ART_INSTITUTE_CHICAGO",
      lotCategory: "FINE_ART",
      startingBidCents: 100000n,
      minIncrementCents: 5000n,
      startsAt,
      endsAt,
      originalEndsAt: endsAt,
      status: "LIVE",
    },
    update: { status: "LIVE", endsAt, startsAt, lotCategory: "FINE_ART" },
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

  // ── Extra lots ────────────────────────────────────────────────────────────
  const extraLots: {
    id: string;
    externalId: string;
    title: string;
    description: string;
    artist: string;
    date: string;
    imageUrl: string;
    lotCategory: "FINE_ART" | "JEWELRY" | "WATCHES" | "ANTIQUITIES" | "NUMISMATICS" | "FASHION" | "VEHICLES" | "BOOKS" | "WINE" | "OTHER";
    startingBidCents: bigint;
    status: "SCHEDULED" | "LIVE" | "CLOSED";
    offsetMs: number; // offset from now for startsAt / endsAt
  }[] = [
    {
      id: "seed-lot-2",
      externalId: "28560",
      title: "A Grande Onda de Kanagawa",
      description: "Famosa gravura em madeira de Hokusai, circa 1831, representando a força das ondas do oceano.",
      artist: "Katsushika Hokusai",
      date: "ca. 1831",
      imageUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a5/Tsunami_by_hokusai_19th_century.jpg/1280px-Tsunami_by_hokusai_19th_century.jpg",
      lotCategory: "FINE_ART",
      startingBidCents: 50000n,
      status: "SCHEDULED",
      offsetMs: 2 * 3_600_000, // starts in 2h
    },
    {
      id: "seed-lot-3",
      externalId: "14966",
      title: "Noite Estrelada",
      description: "Obra-prima de Vincent van Gogh pintada em junho de 1889 durante sua estadia no asilo em Saint-Rémy-de-Provence.",
      artist: "Vincent van Gogh",
      date: "1889",
      imageUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/ea/Van_Gogh_-_Starry_Night_-_Google_Art_Project.jpg/1280px-Van_Gogh_-_Starry_Night_-_Google_Art_Project.jpg",
      lotCategory: "FINE_ART",
      startingBidCents: 200000n,
      status: "SCHEDULED",
      offsetMs: 5 * 3_600_000, // starts in 5h
    },
    {
      id: "seed-lot-4",
      externalId: "66039",
      title: "Moça com Brinco de Pérola",
      description: "Obra de Johannes Vermeer, circa 1665. Considerada a 'Mona Lisa do Norte', retrata uma jovem com um exótico brinco de pérola.",
      artist: "Johannes Vermeer",
      date: "ca. 1665",
      imageUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/c/ce/Girl_with_a_Pearl_Earring.jpg/1280px-Girl_with_a_Pearl_Earring.jpg",
      lotCategory: "FINE_ART",
      startingBidCents: 150000n,
      status: "SCHEDULED",
      offsetMs: 24 * 3_600_000, // starts in 24h
    },
    {
      id: "seed-lot-5",
      externalId: "87479",
      title: "O Grito",
      description: "Ícone expressionista de Edvard Munch, 1893. Uma das imagens mais reconhecíveis da história da arte ocidental.",
      artist: "Edvard Munch",
      date: "1893",
      imageUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/f/f4/The_Scream.jpg/1280px-The_Scream.jpg",
      lotCategory: "FINE_ART",
      startingBidCents: 180000n,
      status: "CLOSED",
      offsetMs: -3 * 3_600_000, // ended 3h ago
    },
    {
      id: "seed-lot-6",
      externalId: "11279",
      title: "American Gothic",
      description: "Pintura icônica de Grant Wood, 1930, retratando um fazendeiro americano e uma mulher diante de uma casa de estilo gótico.",
      artist: "Grant Wood",
      date: "1930",
      imageUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/c/cc/Grant_Wood_-_American_Gothic_-_Google_Art_Project.jpg/1280px-Grant_Wood_-_American_Gothic_-_Google_Art_Project.jpg",
      lotCategory: "FINE_ART",
      startingBidCents: 80000n,
      status: "CLOSED",
      offsetMs: -6 * 3_600_000, // ended 6h ago
    },
  ];

  for (const extra of extraLots) {
    const snap = await prisma.catalogItemSnapshot.upsert({
      where: { provider_externalId: { provider: "ART_INSTITUTE_CHICAGO", externalId: extra.externalId } },
      create: {
        provider: "ART_INSTITUTE_CHICAGO",
        externalId: extra.externalId,
        title: extra.title,
        attributes: { artist: extra.artist, date: extra.date },
        sourceImageUrl: extra.imageUrl,
      },
      update: { sourceImageUrl: extra.imageUrl },
    });

    const lotStartsAt = new Date(now.getTime() + (extra.status === "CLOSED" ? extra.offsetMs - 3_600_000 : extra.offsetMs));
    const lotEndsAt = new Date(now.getTime() + (extra.status === "CLOSED" ? extra.offsetMs : extra.offsetMs + 4 * 3_600_000));

    await prisma.lot.upsert({
      where: { id: extra.id },
      create: {
        id: extra.id,
        auctioneerId: auctioneer.id,
        snapshotId: snap.id,
        title: extra.title,
        description: extra.description,
        category: "ART_INSTITUTE_CHICAGO",
        lotCategory: extra.lotCategory,
        startingBidCents: extra.startingBidCents,
        minIncrementCents: 5000n,
        startsAt: lotStartsAt,
        endsAt: lotEndsAt,
        originalEndsAt: lotEndsAt,
        status: extra.status,
        ...(extra.status === "CLOSED" ? { closedAt: lotEndsAt } : {}),
      },
      update: {
        status: extra.status,
        lotCategory: extra.lotCategory,
        snapshotId: snap.id,
      },
    });
  }
  // ── End extra lots ─────────────────────────────────────────────────────────

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
