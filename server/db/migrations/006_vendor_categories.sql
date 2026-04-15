-- Migration 006: Vendor categories master table
CREATE TABLE IF NOT EXISTS vendor_categories (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       VARCHAR(100) UNIQUE NOT NULL,
  is_active  BOOLEAN DEFAULT true,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Backfill existing vendor.category values into the new master table
INSERT INTO vendor_categories (name, created_by)
SELECT DISTINCT TRIM(v.category), MIN(v.created_by::text)::uuid
FROM vendors v
WHERE v.category IS NOT NULL AND TRIM(v.category) <> ''
GROUP BY TRIM(v.category)
ON CONFLICT (name) DO NOTHING;
