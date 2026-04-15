-- Migration 005: Invoice Management System

CREATE TABLE IF NOT EXISTS invoices (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   UUID REFERENCES projects(id) ON DELETE SET NULL,
  po_id        UUID REFERENCES purchase_orders(id) ON DELETE SET NULL,
  vendor_id    UUID REFERENCES vendors(id) ON DELETE SET NULL,
  uploaded_by  UUID NOT NULL REFERENCES users(id),
  approved     BOOLEAN DEFAULT false,
  paid         BOOLEAN DEFAULT false,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS invoice_files (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id  UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  file_url    TEXT NOT NULL,
  file_name   VARCHAR(255),
  file_type   VARCHAR(50),
  file_size   INT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
