import { createHash } from "node:crypto";

interface BidHashInput {
  lotId: string;
  bidId: string;
  bidderId: string;
  amountCents: bigint;
  prevHash: string | null;
}

interface BidChainEntry {
  lotId: string;
  bidderId: string;
  amountCents: bigint;
  hash: string;
  previousHash: string;
  sequence: number;
}

export function hashBid(input: BidHashInput): string {
  const payload = [
    input.lotId,
    input.bidId,
    input.bidderId,
    input.amountCents.toString(),
    input.prevHash ?? "genesis",
  ].join("|");
  return createHash("sha256").update(payload).digest("hex");
}

export function verifyBidChain(bids: BidChainEntry[]): boolean {
  if (bids.length === 0) return true;

  for (let i = 0; i < bids.length; i++) {
    const bid = bids[i];
    if (!bid) return false;
    const expectedPrevHash = i === 0 ? "genesis" : (bids[i - 1]?.hash ?? "genesis");
    if (bid.previousHash !== expectedPrevHash) return false;

    const expected = hashBid({
      lotId: bid.lotId,
      bidId: `${bid.lotId}-${bid.sequence}`,
      bidderId: bid.bidderId,
      amountCents: bid.amountCents,
      prevHash: i === 0 ? null : (bids[i - 1]?.hash ?? null),
    });
    if (bid.hash !== expected) return false;
  }
  return true;
}
