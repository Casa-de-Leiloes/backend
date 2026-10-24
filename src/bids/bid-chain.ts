import { createHash } from "node:crypto";

interface BidHashInput {
  lotId: string;
  bidId: string;
  bidderId: string;
  amountCents: bigint;
  prevHash: string | null;
}

interface BidChainEntry {
  id: string;
  lotId: string;
  bidderId: string;
  amountCents: bigint;
  chainHash: string;
  prevHash: string | null;
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
    const expectedPrevHash = i === 0 ? null : (bids[i - 1]?.chainHash ?? null);
    if (bid.prevHash !== expectedPrevHash) return false;

    const expected = hashBid({
      lotId: bid.lotId,
      bidId: bid.id,
      bidderId: bid.bidderId,
      amountCents: bid.amountCents,
      prevHash: bid.prevHash,
    });
    if (bid.chainHash !== expected) return false;
  }
  return true;
}
