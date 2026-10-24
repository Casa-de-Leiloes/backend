CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX "Lot_title_trgm_idx" ON "Lot" USING GIN ("title" gin_trgm_ops);
