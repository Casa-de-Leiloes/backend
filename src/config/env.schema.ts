import { z } from "zod";

export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  FERNET_KEYS: z.string().min(1),
  EMAIL_LOOKUP_KEY: z.string().min(32),
  PSEUDONYM_KEY: z.string().min(32),
  AUDIT_SIGNING_KEY: z.string().min(32),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.string().url(),
  PASSKEY_RP_ID: z.string().min(1),
  PASSKEY_ORIGIN: z.string().url(),
  FRONTEND_ORIGIN: z.string().url(),
});

export type AppEnv = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): AppEnv {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    const formatted = result.error.format();
    throw new Error(`Invalid environment configuration:\n${JSON.stringify(formatted, null, 2)}`);
  }
  return result.data;
}
