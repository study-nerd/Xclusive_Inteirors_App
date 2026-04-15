-- ============================================================
-- Xclusive Interiors — Full Database Schema
-- Run order matters — dependencies first
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── 1. USERS ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(100) NOT NULL,
  email         VARCHAR(150) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role          VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'manager', 'employee')),
  is_active     BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── 2. VENDORS ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vendors (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                 VARCHAR(150) NOT NULL,
  contact_person       VARCHAR(100),
  phone                VARCHAR(20),
  email                VARCHAR(150),
  address              TEXT,
  category             VARCHAR(100),
  gstin                VARCHAR(20),
  pan                  VARCHAR(20),
  bank_account_holder  VARCHAR(150),
  bank_account_number  VARCHAR(50),
  bank_ifsc            VARCHAR(20),
  bank_name            VARCHAR(100),
  is_active            BOOLEAN DEFAULT true,
  created_by           UUID REFERENCES users(id),
  created_at           TIMESTAMPTZ DEFAULT NOW()
);

-- ── 3. CATEGORIES ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS categories (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       VARCHAR(100) UNIQUE NOT NULL,
  is_active  BOOLEAN DEFAULT true,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── 4. ELEMENTS MASTER ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS elements (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         VARCHAR(200) NOT NULL,
  description  TEXT,
  category_id  UUID REFERENCES categories(id),
  default_unit VARCHAR(50),
  gst_percent  NUMERIC(5,2) DEFAULT 0,
  brand_make   VARCHAR(150),
  is_active    BOOLEAN DEFAULT true,
  created_by   UUID REFERENCES users(id),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ── 5. PROJECTS ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS projects (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name           VARCHAR(200) NOT NULL,
  code           VARCHAR(50) UNIQUE NOT NULL,
  client_name    VARCHAR(150),
  site_address   TEXT,
  location       VARCHAR(150),
  status         VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'completed', 'template')),
  project_type   VARCHAR(30) CHECK (project_type IN (
                   '2BHK','2.5BHK','3BHK','3.5BHK','4BHK','4.5BHK',
                   '5BHK','5.5BHK','6BHK',
                   '3BHK_Bungalow','4BHK_Bungalow','5BHK_Bungalow',
                   '6BHK_Bungalow','6BHK_Plus_Bungalow','Commercial'
                 )),
  services_taken VARCHAR(50) CHECK (services_taken IN ('Turnkey','Project M.','Design Consultancy','PM')),
  team_lead_3d   VARCHAR(100),
  team_lead_2d   VARCHAR(100),
  remarks        TEXT,
  project_scope  TEXT,
  start_date     DATE,
  end_date       DATE,
  created_by     UUID REFERENCES users(id),
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ── 6. PROJECT TEAM ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS project_team (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  user_id    UUID REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(project_id, user_id)
);

-- ── 7. PROJECT CONTRACTORS ───────────────────────────────────
CREATE TABLE IF NOT EXISTS project_contractors (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID REFERENCES projects(id) ON DELETE CASCADE,
  trade           VARCHAR(50) NOT NULL CHECK (trade IN (
                    'site_supervisor','civil','plumber','tiles',
                    'false_ceiling','electrician','carpenter','painter','other'
                  )),
  contractor_name VARCHAR(150) NOT NULL,
  vendor_id       UUID REFERENCES vendors(id),
  notes           TEXT
);

-- ── 8. ACTIVITY SCHEDULE TEMPLATES ──────────────────────────
CREATE TABLE IF NOT EXISTS activity_schedule_templates (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_no          VARCHAR(10) NOT NULL,
  milestone_name       VARCHAR(300) NOT NULL,
  phase                VARCHAR(100) NOT NULL,
  step_number          INT NOT NULL,
  project_type         VARCHAR(30) NOT NULL,
  duration_days        INT NOT NULL,
  dependency_condition VARCHAR(30),
  is_active            BOOLEAN DEFAULT true
);

-- ── 9. PROJECT ACTIVITY SCHEDULE ─────────────────────────────
CREATE TABLE IF NOT EXISTS project_activity_schedule (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id         UUID REFERENCES projects(id) ON DELETE CASCADE,
  template_id        UUID REFERENCES activity_schedule_templates(id),
  activity_no        VARCHAR(10) NOT NULL,
  milestone_name     VARCHAR(300) NOT NULL,
  phase              VARCHAR(100),
  step_number        INT,
  planned_start_date DATE,
  planned_end_date   DATE,
  actual_start_date  DATE,
  actual_end_date    DATE,
  status             VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','in_progress','completed','delayed')),
  completed_by       UUID REFERENCES users(id),
  notes              TEXT,
  sort_order         INT DEFAULT 0
);

-- ── 10. PURCHASE ORDERS ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS purchase_orders (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_number        VARCHAR(50) UNIQUE NOT NULL,
  project_id       UUID REFERENCES projects(id),
  vendor_id        UUID REFERENCES vendors(id),
  created_by       UUID REFERENCES users(id),
  order_poc_user_id UUID REFERENCES users(id),
  status           VARCHAR(30) DEFAULT 'draft' CHECK (status IN ('draft','pending_approval','approved','rejected')),
  subtotal         NUMERIC(12,2) DEFAULT 0,
  gst_total        NUMERIC(12,2) DEFAULT 0,
  total            NUMERIC(12,2) DEFAULT 0,
  work_start_date  DATE,
  work_end_date    DATE,
  payment_terms    TEXT,
  other_terms      TEXT,
  admin_comment    TEXT,
  submitted_at     TIMESTAMPTZ,
  approved_at      TIMESTAMPTZ,
  approved_by      UUID REFERENCES users(id),
  email_sent       BOOLEAN DEFAULT false,
  pdf_path         TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ── 11. PO LINE ITEMS ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS po_line_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id       UUID REFERENCES purchase_orders(id) ON DELETE CASCADE,
  element_id  UUID REFERENCES elements(id),
  item_name   VARCHAR(200) NOT NULL,
  description TEXT,
  category_id UUID REFERENCES categories(id),
  unit        VARCHAR(50),
  quantity    NUMERIC(10,3) NOT NULL,
  rate        NUMERIC(12,2) NOT NULL,
  gst_percent NUMERIC(5,2) DEFAULT 0,
  gst_amount  NUMERIC(12,2) DEFAULT 0,
  total       NUMERIC(12,2) DEFAULT 0,
  brand_make  VARCHAR(150),
  is_custom   BOOLEAN DEFAULT false,
  sort_order  INT DEFAULT 0
);

-- ── 12. DPR ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dprs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id       UUID REFERENCES projects(id),
  submitted_by     UUID REFERENCES users(id),
  report_date      DATE NOT NULL,
  work_description TEXT,
  progress_summary TEXT,
  work_completed   TEXT,
  issues_faced     TEXT,
  material_used    TEXT,
  status           VARCHAR(20) DEFAULT 'submitted',
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id, submitted_by, report_date)
);

CREATE TABLE IF NOT EXISTS dpr_images (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dpr_id      UUID REFERENCES dprs(id) ON DELETE CASCADE,
  file_url    TEXT NOT NULL,
  file_name   VARCHAR(255),
  uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dpr_voice_notes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dpr_id      UUID REFERENCES dprs(id) ON DELETE CASCADE,
  file_url    TEXT NOT NULL,
  file_name   VARCHAR(255),
  uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── 13. CHECKLIST TEMPLATES ──────────────────────────────────
CREATE TABLE IF NOT EXISTS checklist_templates (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       VARCHAR(200) NOT NULL,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS checklist_template_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID REFERENCES checklist_templates(id) ON DELETE CASCADE,
  task_name   VARCHAR(300) NOT NULL,
  sort_order  INT DEFAULT 0
);

-- ── 14. PROJECT CHECKLISTS ───────────────────────────────────
CREATE TABLE IF NOT EXISTS project_checklists (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID REFERENCES projects(id) ON DELETE CASCADE,
  template_id UUID REFERENCES checklist_templates(id),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS project_checklist_items (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_checklist_id UUID REFERENCES project_checklists(id) ON DELETE CASCADE,
  task_name            VARCHAR(300) NOT NULL,
  is_completed         BOOLEAN DEFAULT false,
  completed_by         UUID REFERENCES users(id),
  completed_at         TIMESTAMPTZ,
  sort_order           INT DEFAULT 0
);

-- ── 15. SNAGLIST ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS snags (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id               UUID REFERENCES projects(id) ON DELETE CASCADE,
  reported_by              UUID REFERENCES users(id),
  area                     VARCHAR(150),
  item_name                VARCHAR(200),
  description              TEXT NOT NULL,
  status                   VARCHAR(20) DEFAULT 'open' CHECK (status IN ('open','in_review','resolved')),
  vendor_id                UUID REFERENCES vendors(id),
  date_of_confirmation     DATE,
  date_of_material_supply  DATE,
  designer_name            VARCHAR(100),
  admin_note               TEXT,
  resolved_by              UUID REFERENCES users(id),
  resolved_at              TIMESTAMPTZ,
  created_at               TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS snag_images (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snag_id     UUID REFERENCES snags(id) ON DELETE CASCADE,
  file_url    TEXT NOT NULL,
  uploaded_at TIMESTAMPTZ DEFAULT NOW()
);
