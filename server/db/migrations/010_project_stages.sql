-- ============================================================
-- 010_project_stages.sql
-- Stage Engine: extends project_activity_schedule,
-- adds stage templates, audit logs
-- ============================================================

-- Extend project_activity_schedule with stage-engine fields
ALTER TABLE project_activity_schedule
  ADD COLUMN IF NOT EXISTS weight          NUMERIC(5,2) DEFAULT 1,
  ADD COLUMN IF NOT EXISTS assigned_to     UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS attachment_url  TEXT,
  ADD COLUMN IF NOT EXISTS phase_group     VARCHAR(100),
  ADD COLUMN IF NOT EXISTS created_by      UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS updated_by      UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS created_at      TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at      TIMESTAMPTZ DEFAULT NOW();

-- Add 'blocked' to status enum (drop old constraint, re-add)
ALTER TABLE project_activity_schedule
  DROP CONSTRAINT IF EXISTS project_activity_schedule_status_check;

ALTER TABLE project_activity_schedule
  ADD CONSTRAINT project_activity_schedule_status_check
  CHECK (status IN ('pending','in_progress','completed','delayed','blocked'));

-- Stage templates (user-managed, named templates like "3BHK Flow")
CREATE TABLE IF NOT EXISTS stage_templates (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         VARCHAR(200) NOT NULL,
  description  TEXT,
  project_type VARCHAR(50),
  created_by   UUID REFERENCES users(id),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS stage_template_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id   UUID REFERENCES stage_templates(id) ON DELETE CASCADE,
  title         VARCHAR(300) NOT NULL,
  phase_group   VARCHAR(100),
  sort_order    INT DEFAULT 0,
  weight        NUMERIC(5,2) DEFAULT 1,
  duration_days INT DEFAULT 0
);

-- Audit logs
CREATE TABLE IF NOT EXISTS audit_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES users(id),
  user_name   VARCHAR(100),
  action      VARCHAR(100) NOT NULL,
  entity_type VARCHAR(50)  NOT NULL,
  entity_id   UUID,
  old_data    JSONB,
  new_data    JSONB,
  notes       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_entity  ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_user    ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_pas_project_status ON project_activity_schedule(project_id, status);
CREATE INDEX IF NOT EXISTS idx_pas_phase          ON project_activity_schedule(project_id, phase);
