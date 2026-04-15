-- Migration 004: Snag file attachments (non-image files)
CREATE TABLE IF NOT EXISTS snag_files (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snag_id     UUID REFERENCES snags(id) ON DELETE CASCADE,
  file_url    TEXT NOT NULL,
  file_name   VARCHAR(255),
  file_type   VARCHAR(50),   -- pdf, docx, xlsx, etc.
  file_size   INT,           -- bytes
  uploaded_at TIMESTAMPTZ DEFAULT NOW()
);
