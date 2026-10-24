ALTER TABLE "Wallet"
  ADD CONSTRAINT "Wallet_totalCents_check" CHECK ("totalCents" >= 0),
  ADD CONSTRAINT "Wallet_committedCents_check" CHECK ("committedCents" >= 0),
  ADD CONSTRAINT "Wallet_committed_lte_total_check" CHECK ("committedCents" <= "totalCents");

ALTER TABLE "Lot"
  ADD CONSTRAINT "Lot_startingBidCents_check" CHECK ("startingBidCents" > 0),
  ADD CONSTRAINT "Lot_minIncrementCents_check" CHECK ("minIncrementCents" > 0),
  ADD CONSTRAINT "Lot_currentBidCents_check" CHECK ("currentBidCents" >= 0);

ALTER TABLE "Bid"
  ADD CONSTRAINT "Bid_amountCents_check" CHECK ("amountCents" > 0);

ALTER TABLE "WalletLedgerEntry"
  ADD CONSTRAINT "WalletLedgerEntry_amountCents_check" CHECK ("amountCents" > 0);

ALTER TABLE "Receipt"
  ADD CONSTRAINT "Receipt_amountCents_check" CHECK ("amountCents" > 0);
