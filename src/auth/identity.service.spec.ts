import { IdentityService } from "./identity.service";

const validKey = Buffer.from("0".repeat(32)).toString("base64url");
const otherKey = Buffer.from("1".repeat(32)).toString("base64url");

function makeSvc(fernetKeys: string[]) {
  return IdentityService.fromOptions({
    fernetKeys,
    emailLookupKey: "email-key-32-chars-minimum-pad!!",
    pseudonymKey: "pseudo-key-32-chars-minimum-pad!",
  });
}

describe("IdentityService", () => {
  describe("Fernet encrypt/decrypt", () => {
    it("round-trips a plaintext value", () => {
      const svc = makeSvc([validKey]);
      const token = svc.encrypt("hello world");
      expect(svc.decrypt(token)).toBe("hello world");
    });

    it("produces different ciphertexts for same plaintext (random IV)", () => {
      const svc = makeSvc([validKey]);
      const t1 = svc.encrypt("test");
      const t2 = svc.encrypt("test");
      expect(t1).not.toBe(t2);
    });

    it("decrypts a token encrypted with an older key after rotation", () => {
      const svcOld = makeSvc([validKey]);
      const tokenEncryptedWithOldKey = svcOld.encrypt("secret");

      const svcRotated = makeSvc([otherKey, validKey]);
      expect(svcRotated.decrypt(tokenEncryptedWithOldKey)).toBe("secret");
    });

    it("new encryptions use the first (current) key", () => {
      const svcRotated = makeSvc([otherKey, validKey]);
      const token = svcRotated.encrypt("new value");

      const svcOldKeyOnly = makeSvc([validKey]);
      expect(() => svcOldKeyOnly.decrypt(token)).toThrow();
    });

    it("rejects tampered ciphertext", () => {
      const svc = makeSvc([validKey]);
      const token = svc.encrypt("data");
      const tampered = `${token.slice(0, -4)}XXXX`;
      expect(() => svc.decrypt(tampered)).toThrow();
    });
  });

  describe("blind index", () => {
    it("is deterministic for same input", () => {
      const svc = makeSvc([validKey]);
      expect(svc.blindIndex("foo@example.com")).toBe(svc.blindIndex("foo@example.com"));
    });

    it("produces same index for case-normalized equals", () => {
      const svc = makeSvc([validKey]);
      expect(svc.blindIndex("Foo@X.com")).toBe(svc.blindIndex("foo@x.com"));
    });

    it("produces different indexes for different emails", () => {
      const svc = makeSvc([validKey]);
      expect(svc.blindIndex("a@b.com")).not.toBe(svc.blindIndex("c@d.com"));
    });
  });

  describe("aliasEmail", () => {
    it("returns a @users.invalid alias", () => {
      const svc = makeSvc([validKey]);
      expect(svc.aliasEmail("user@example.com")).toMatch(/@users\.invalid$/);
    });

    it("returns same alias for case-normalized equals", () => {
      const svc = makeSvc([validKey]);
      expect(svc.aliasEmail("Foo@X.com")).toBe(svc.aliasEmail("foo@x.com"));
    });
  });
});
