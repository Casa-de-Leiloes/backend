import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

let prisma: PrismaClient;

beforeAll(async () => {
  const databaseUrl = process.env["DATABASE_URL"];
  if (!databaseUrl) throw new Error("DATABASE_URL required for integration tests");
  const adapter = new PrismaPg({ connectionString: databaseUrl });
  prisma = new PrismaClient({ adapter });
  await prisma.$connect();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("Wallet DB constraints", () => {
  it("rejects committedCents > totalCents", async () => {
    const userId = `test-user-${Date.now()}`;
    await prisma.user.create({
      data: {
        id: userId,
        role: "BIDDER",
        email: `${userId}@users.invalid`,
        name: "Test User",
        encryptedEmail: "enc-email",
        encryptedFullName: "enc-name",
      },
    });

    await expect(
      prisma.$executeRawUnsafe(
        `INSERT INTO "Wallet" (id, "userId", "totalCents", "committedCents", "createdAt", "updatedAt")
         VALUES (gen_random_uuid()::text, $1, 100, 200, now(), now())`,
        userId,
      ),
    ).rejects.toThrow();

    await prisma.user.delete({ where: { id: userId } });
  });

  it("accepts committedCents = totalCents", async () => {
    const userId = `test-user-${Date.now()}-2`;
    await prisma.user.create({
      data: {
        id: userId,
        role: "BIDDER",
        email: `${userId}@users.invalid`,
        name: "Test User 2",
        encryptedEmail: "enc-email",
        encryptedFullName: "enc-name",
      },
    });

    const wallet = await prisma.wallet.create({
      data: { userId, totalCents: 500n, committedCents: 500n },
    });

    expect(wallet.totalCents).toBe(500n);
    expect(wallet.committedCents).toBe(500n);

    await prisma.user.delete({ where: { id: userId } });
  });
});
