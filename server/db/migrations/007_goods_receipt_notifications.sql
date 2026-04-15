-- ============================================================
-- Migration 007: Goods Receipt + Notifications + Password Tracking
-- ============================================================

-- ── Password change tracking on users ──────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_by_user BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ;

-- ── Goods Receipt (supervisor verification after PO approval) ──
CREATE TABLE IF NOT EXISTS po_goods_receipt (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id           UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  line_item_id    UUID NOT NULL REFERENCES po_line_items(id) ON DELETE CASCADE,
  received_qty    NUMERIC(10,3),
  side_note       TEXT,
  submitted_by    UUID REFERENCES users(id),
  submitted_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(po_id, line_item_id)
);

-- Track overall receipt submission status on PO
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS receipt_submitted    BOOLEAN DEFAULT false;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS receipt_submitted_at TIMESTAMPTZ;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS receipt_submitted_by UUID REFERENCES users(id);

-- ── Notifications ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type        VARCHAR(50) NOT NULL,
  -- types: 'receipt_overdue', 'discrepancy', 'po_approved', 'po_rejected'
  title       TEXT NOT NULL,
  body        TEXT,
  po_id       UUID REFERENCES purchase_orders(id) ON DELETE CASCADE,
  is_read     BOOLEAN DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON notifications(user_id, is_read, created_at DESC);
