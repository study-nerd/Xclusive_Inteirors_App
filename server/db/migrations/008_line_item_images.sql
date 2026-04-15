-- Add line item images table + backfill PO creator

CREATE TABLE IF NOT EXISTS line_item_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  line_item_id UUID REFERENCES po_line_items(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_line_item_images_line_item_id
  ON line_item_images(line_item_id);

-- Backfill PO creator if missing
UPDATE purchase_orders
SET created_by = (SELECT id FROM users ORDER BY created_at ASC LIMIT 1)
WHERE created_by IS NULL;
