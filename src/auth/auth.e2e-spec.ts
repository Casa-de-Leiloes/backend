import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../app.module";

let app: INestApplication;

beforeAll(async () => {
  const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = module.createNestApplication();
  app.setGlobalPrefix("api", { exclude: ["health/live", "health/ready"] });
  await app.init();
}, 30_000);

afterAll(async () => {
  await app.close();
});

describe("Auth e2e", () => {
  const email = `e2e-${Date.now()}@example.com`;
  const password = "Test1234!";
  let cookie: string;

  it("signs up as AUCTIONEER", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/auth/sign-up/email")
      .set("Origin", "http://localhost:5173")
      .send({ email, password, name: "Test Auctioneer", role: "AUCTIONEER" });

    expect([200, 201]).toContain(res.status);
  });

  it("signs in", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/auth/sign-in/email")
      .set("Origin", "http://localhost:5173")
      .send({ email, password });

    expect([200, 201]).toContain(res.status);
    const setCookie = res.headers["set-cookie"];
    cookie = Array.isArray(setCookie) ? setCookie[0] : setCookie;
    expect(cookie).toBeDefined();
  });

  it("GET /health/live works without auth (public route)", async () => {
    const res = await request(app.getHttpServer()).get("/health/live");
    expect(res.status).toBe(200);
  });

  it("session resolves user after sign-in", async () => {
    const res = await request(app.getHttpServer())
      .get("/api/auth/get-session")
      .set("Cookie", cookie ?? "");

    expect(res.status).toBe(200);
    expect(res.body?.user?.role).toBe("AUCTIONEER");
  });
});
