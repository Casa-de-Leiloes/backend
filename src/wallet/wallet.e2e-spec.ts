import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../app.module";

let app: INestApplication;
let cookie: string;

const email = `wallet-e2e-${Date.now()}@example.com`;
const password = "Test1234!";

beforeAll(async () => {
  const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = module.createNestApplication();
  app.setGlobalPrefix("api", { exclude: ["health/live", "health/ready"] });
  await app.init();

  await request(app.getHttpServer())
    .post("/api/auth/sign-up/email")
    .set("Origin", "http://localhost:5173")
    .send({ email, password, name: "Wallet Bidder", role: "BIDDER" });

  const res = await request(app.getHttpServer())
    .post("/api/auth/sign-in/email")
    .set("Origin", "http://localhost:5173")
    .send({ email, password });

  const setCookie = res.headers["set-cookie"];
  cookie = Array.isArray(setCookie) ? setCookie[0] : (setCookie ?? "");
}, 30_000);

afterAll(async () => {
  await app.close();
}, 30_000);

describe("Wallet e2e", () => {
  it("GET /wallets/me/balance returns zero balance for new user", async () => {
    const res = await request(app.getHttpServer())
      .get("/api/wallets/me/balance")
      .set("Cookie", cookie);

    expect(res.status).toBe(200);
    expect(res.body.totalCents).toBe("0");
    expect(res.body.committedCents).toBe("0");
    expect(res.body.availableCents).toBe("0");
  });

  it("POST /wallets/me/deposit adds funds and returns updated balance", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/wallets/me/deposit")
      .set("Cookie", cookie)
      .send({ amountCents: 5000 });

    expect(res.status).toBe(201);
    expect(res.body.totalCents).toBe("5000");
    expect(res.body.availableCents).toBe("5000");
  });

  it("GET /wallets/me/balance reflects deposit", async () => {
    const res = await request(app.getHttpServer())
      .get("/api/wallets/me/balance")
      .set("Cookie", cookie);

    expect(res.status).toBe(200);
    expect(res.body.totalCents).toBe("5000");
  });

  it("GET /wallets/me/ledger returns entries with stringified amounts", async () => {
    const res = await request(app.getHttpServer())
      .get("/api/wallets/me/ledger")
      .set("Cookie", cookie);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    expect(typeof res.body[0].amountCents).toBe("string");
  });

  it("POST /wallets/me/deposit rejects invalid amount", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/wallets/me/deposit")
      .set("Cookie", cookie)
      .send({ amountCents: -100 });

    expect(res.status).toBe(400);
  });

  it("GET /wallets/me/balance requires auth", async () => {
    const res = await request(app.getHttpServer()).get("/api/wallets/me/balance");
    expect(res.status).toBe(401);
  });
});
