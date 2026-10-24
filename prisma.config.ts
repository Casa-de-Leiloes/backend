import path from "node:path";
import { defineConfig } from "prisma/config";

export default defineConfig({
  earlyAccess: true,
  schema: path.join(import.meta.dirname, "prisma/schema.prisma"),
  datasource: {
    url: process.env["DATABASE_URL"] ?? "",
  },
  migrate: {
    async adapter() {
      const { PrismaPg } = await import("@prisma/adapter-pg");
      const databaseUrl = process.env["DATABASE_URL"];
      if (!databaseUrl) throw new Error("DATABASE_URL is required");
      return new PrismaPg({ connectionString: databaseUrl });
    },
  },
});
