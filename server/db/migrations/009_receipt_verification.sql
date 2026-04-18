-- 009_receipt_verification.sql
-- 2-step goods receipt verification: user submits → admin verifies

ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS receipt_status TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS receipt_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS receipt_verified_by UUID,
  ADD COLUMN IF NOT EXISTS receipt_challan_url TEXT;

ALTER TABLE po_goods_receipt
  ADD COLUMN IF NOT EXISTS challan_image_url TEXT;
