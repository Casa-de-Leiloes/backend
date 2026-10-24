import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { Injectable, Optional } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import type { AppEnv } from "../config/env.schema";

const FERNET_VERSION = 0x80;
const KEY_SIZE = 32;
const HMAC_SIZE = 32;
const IV_SIZE = 16;

function deriveSubkeys(keyBase64: string): { encKey: Buffer; sigKey: Buffer } {
  const raw = Buffer.from(keyBase64, "base64url");
  if (raw.length !== KEY_SIZE) throw new Error("Fernet key must be 32 bytes");
  return { sigKey: raw.subarray(0, 16), encKey: raw.subarray(16, 32) };
}

function fernetEncrypt(plain: string, keyBase64: string): string {
  const { encKey, sigKey } = deriveSubkeys(keyBase64);
  const iv = randomBytes(IV_SIZE);
  const ts = Buffer.alloc(8);
  ts.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 1000)));

  const cipher = createCipheriv("aes-128-cbc", encKey, iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);

  const header = Buffer.concat([Buffer.from([FERNET_VERSION]), ts, iv]);
  const payload = Buffer.concat([header, ciphertext]);

  const hmac = createHmac("sha256", sigKey).update(payload).digest();
  return Buffer.concat([payload, hmac]).toString("base64url");
}

function fernetDecrypt(token: string, keyBase64: string): string {
  const { encKey, sigKey } = deriveSubkeys(keyBase64);
  const raw = Buffer.from(token, "base64url");
  const minLength = 1 + 8 + IV_SIZE + 16 + HMAC_SIZE;
  if (raw.length < minLength) throw new Error("Invalid token length");
  if (raw[0] !== FERNET_VERSION) throw new Error("Unsupported token version");

  const payload = raw.subarray(0, raw.length - HMAC_SIZE);
  const expectedHmac = createHmac("sha256", sigKey).update(payload).digest();
  const actualHmac = raw.subarray(raw.length - HMAC_SIZE);

  if (!timingSafeEqual(expectedHmac, actualHmac)) throw new Error("HMAC mismatch");

  const iv = raw.subarray(9, 9 + IV_SIZE);
  const ciphertext = payload.subarray(9 + IV_SIZE);

  const decipher = createDecipheriv("aes-128-cbc", encKey, iv);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

export interface IdentityServiceOptions {
  fernetKeys: string[];
  emailLookupKey: string;
  pseudonymKey: string;
}

@Injectable()
export class IdentityService {
  private readonly fernetKeys: string[];
  private readonly emailLookupKey: string;
  readonly pseudonymKey: string;

  constructor(@Optional() config?: ConfigService<AppEnv, true>) {
    if (config) {
      this.fernetKeys = config
        .get("FERNET_KEYS", { infer: true })
        .split(",")
        .map((k) => k.trim());
      this.emailLookupKey = config.get("EMAIL_LOOKUP_KEY", { infer: true });
      this.pseudonymKey = config.get("PSEUDONYM_KEY", { infer: true });
    } else {
      this.fernetKeys = (process.env.FERNET_KEYS ?? "")
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean);
      this.emailLookupKey = process.env.EMAIL_LOOKUP_KEY ?? "";
      this.pseudonymKey = process.env.PSEUDONYM_KEY ?? "";
    }
    if (this.fernetKeys.length === 0) throw new Error("At least one Fernet key is required");
  }

  static fromOptions(opts: IdentityServiceOptions): IdentityService {
    process.env.FERNET_KEYS = opts.fernetKeys.join(",");
    process.env.EMAIL_LOOKUP_KEY = opts.emailLookupKey;
    process.env.PSEUDONYM_KEY = opts.pseudonymKey;
    return new IdentityService();
  }

  encrypt(plain: string): string {
    const primaryKey = this.fernetKeys[0];
    if (!primaryKey) throw new Error("No Fernet key available");
    return fernetEncrypt(plain, primaryKey);
  }

  decrypt(token: string): string {
    for (const key of this.fernetKeys) {
      try {
        return fernetDecrypt(token, key);
      } catch {
        // try next key
      }
    }
    throw new Error("Unable to decrypt token with any known key");
  }

  blindIndex(email: string): string {
    const normalized = email.toLowerCase().trim();
    return createHmac("sha256", this.emailLookupKey).update(normalized).digest("hex");
  }

  aliasEmail(email: string): string {
    return `${this.blindIndex(email)}@users.invalid`;
  }
}
