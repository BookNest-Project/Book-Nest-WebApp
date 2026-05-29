-- Multi-item checkout: line items per transaction
CREATE TABLE IF NOT EXISTS transaction_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  book_format_id UUID NOT NULL REFERENCES book_formats(id),
  amount DECIMAL(10, 2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (transaction_id, book_format_id)
);

CREATE INDEX IF NOT EXISTS idx_transaction_items_transaction_id
  ON transaction_items (transaction_id);

-- Cart checkouts may not map to a single format
ALTER TABLE transactions
  ALTER COLUMN book_format_id DROP NOT NULL;
