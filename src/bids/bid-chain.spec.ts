import { hashBid, verifyBidChain } from "./bid-chain";

const signingKey = "test-audit-signing-key-32-chars!";

describe("bid-chain", () => {
  describe("hashBid", () => {
    it("produces a deterministic hash for the same inputs", () => {
      const h1 = hashBid({ lotId: "lot-1", bidId: "bid-1", bidderId: "user-1", amountCents: 1000n, prevHash: null });
      const h2 = hashBid({ lotId: "lot-1", bidId: "bid-1", bidderId: "user-1", amountCents: 1000n, prevHash: null });
      expect(h1).toBe(h2);
    });

    it("chain hashes link: bid 2 includes bid 1 hash", () => {
      const h1 = hashBid({ lotId: "lot-1", bidId: "bid-1", bidderId: "user-1", amountCents: 1000n, prevHash: null });
      const h2 = hashBid({ lotId: "lot-1", bidId: "bid-2", bidderId: "user-2", amountCents: 2000n, prevHash: h1 });
      expect(h2).not.toBe(h1);
    });

    it("different amounts produce different hashes", () => {
      const h1 = hashBid({ lotId: "lot-1", bidId: "bid-1", bidderId: "user-1", amountCents: 1000n, prevHash: null });
      const h2 = hashBid({ lotId: "lot-1", bidId: "bid-1", bidderId: "user-1", amountCents: 2000n, prevHash: null });
      expect(h1).not.toBe(h2);
    });
  });

  describe("verifyBidChain", () => {
    it("accepts a valid chain", () => {
      const h1 = hashBid({ lotId: "lot-1", bidId: "bid-1", bidderId: "user-1", amountCents: 1000n, prevHash: null });
      const h2 = hashBid({ lotId: "lot-1", bidId: "bid-2", bidderId: "user-2", amountCents: 2000n, prevHash: h1 });

      const bids = [
        { id: "bid-1", lotId: "lot-1", bidderId: "user-1", amountCents: 1000n, hash: h1, previousHash: null },
        { id: "bid-2", lotId: "lot-1", bidderId: "user-2", amountCents: 2000n, hash: h2, previousHash: h1 },
      ];
      expect(verifyBidChain(bids)).toBe(true);
    });

    it("rejects tampered amount", () => {
      const h1 = hashBid({ lotId: "lot-1", bidId: "bid-1", bidderId: "user-1", amountCents: 1000n, prevHash: null });
      const bids = [
        { id: "bid-1", lotId: "lot-1", bidderId: "user-1", amountCents: 9999n, hash: h1, previousHash: null },
      ];
      expect(verifyBidChain(bids)).toBe(false);
    });

    it("rejects broken chain link", () => {
      const h1 = hashBid({ lotId: "lot-1", bidId: "bid-1", bidderId: "user-1", amountCents: 1000n, prevHash: null });
      const h2 = hashBid({ lotId: "lot-1", bidId: "bid-2", bidderId: "user-2", amountCents: 2000n, prevHash: h1 });
      const bids = [
        { id: "bid-1", lotId: "lot-1", bidderId: "user-1", amountCents: 1000n, hash: h1, previousHash: null },
        { id: "bid-2", lotId: "lot-1", bidderId: "user-2", amountCents: 2000n, hash: h2, previousHash: "tampered-prev" },
      ];
      expect(verifyBidChain(bids)).toBe(false);
    });

    it("returns true for empty chain", () => {
      expect(verifyBidChain([])).toBe(true);
    });
  });
});
