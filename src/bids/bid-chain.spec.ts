import { hashBid, verifyBidChain } from "./bid-chain";

const LOT = "lot-1";

function makeBidHash(sequence: number, prevHash: string | null, bidderId: string, amount: bigint) {
  return hashBid({
    lotId: LOT,
    bidId: `${LOT}-${sequence}`,
    bidderId,
    amountCents: amount,
    prevHash,
  });
}

describe("bid-chain", () => {
  describe("hashBid", () => {
    it("produces a deterministic hash for the same inputs", () => {
      const h1 = hashBid({ lotId: LOT, bidId: "bid-1", bidderId: "user-1", amountCents: 1000n, prevHash: null });
      const h2 = hashBid({ lotId: LOT, bidId: "bid-1", bidderId: "user-1", amountCents: 1000n, prevHash: null });
      expect(h1).toBe(h2);
    });

    it("chain hashes link: bid 2 includes bid 1 hash", () => {
      const h1 = hashBid({ lotId: LOT, bidId: "bid-1", bidderId: "user-1", amountCents: 1000n, prevHash: null });
      const h2 = hashBid({ lotId: LOT, bidId: "bid-2", bidderId: "user-2", amountCents: 2000n, prevHash: h1 });
      expect(h2).not.toBe(h1);
    });

    it("different amounts produce different hashes", () => {
      const h1 = hashBid({ lotId: LOT, bidId: "bid-1", bidderId: "user-1", amountCents: 1000n, prevHash: null });
      const h2 = hashBid({ lotId: LOT, bidId: "bid-1", bidderId: "user-1", amountCents: 2000n, prevHash: null });
      expect(h1).not.toBe(h2);
    });
  });

  describe("verifyBidChain", () => {
    it("accepts a valid two-bid chain", () => {
      const h1 = makeBidHash(1, null, "user-1", 1000n);
      const h2 = makeBidHash(2, h1, "user-2", 2000n);

      const bids = [
        { lotId: LOT, bidderId: "user-1", amountCents: 1000n, hash: h1, previousHash: "genesis", sequence: 1 },
        { lotId: LOT, bidderId: "user-2", amountCents: 2000n, hash: h2, previousHash: h1, sequence: 2 },
      ];
      expect(verifyBidChain(bids)).toBe(true);
    });

    it("rejects tampered amount", () => {
      const h1 = makeBidHash(1, null, "user-1", 1000n);
      const bids = [
        { lotId: LOT, bidderId: "user-1", amountCents: 9999n, hash: h1, previousHash: "genesis", sequence: 1 },
      ];
      expect(verifyBidChain(bids)).toBe(false);
    });

    it("rejects broken chain link (wrong previousHash)", () => {
      const h1 = makeBidHash(1, null, "user-1", 1000n);
      const h2 = makeBidHash(2, h1, "user-2", 2000n);
      const bids = [
        { lotId: LOT, bidderId: "user-1", amountCents: 1000n, hash: h1, previousHash: "genesis", sequence: 1 },
        { lotId: LOT, bidderId: "user-2", amountCents: 2000n, hash: h2, previousHash: "tampered", sequence: 2 },
      ];
      expect(verifyBidChain(bids)).toBe(false);
    });

    it("returns true for empty chain", () => {
      expect(verifyBidChain([])).toBe(true);
    });
  });
});
