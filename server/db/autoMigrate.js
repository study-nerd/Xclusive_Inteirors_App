const db = require('../config/db');

async function runAutoMigrations() {
  const client = await db.pool.connect();
  try {
    // Extend project_activity_schedule with stage-engine columns (idempotent)
    await client.query(`
      ALTER TABLE project_activity_schedule
        ADD COLUMN IF NOT EXISTS weight          NUMERIC(5,2) DEFAULT 1,
        ADD COLUMN IF NOT EXISTS assigned_to     UUID REFERENCES users(id),
        ADD COLUMN IF NOT EXISTS attachment_url  TEXT,
        ADD COLUMN IF NOT EXISTS phase_group     VARCHAR(100),
        ADD COLUMN IF NOT EXISTS created_by      UUID REFERENCES users(id),
        ADD COLUMN IF NOT EXISTS updated_by      UUID REFERENCES users(id),
        ADD COLUMN IF NOT EXISTS created_at      TIMESTAMPTZ DEFAULT NOW(),
        ADD COLUMN IF NOT EXISTS updated_at      TIMESTAMPTZ DEFAULT NOW()
    `);

    // Replace status check constraint to include 'blocked'
    await client.query(`ALTER TABLE project_activity_schedule DROP CONSTRAINT IF EXISTS project_activity_schedule_status_check`);
    await client.query(`
      ALTER TABLE project_activity_schedule
        ADD CONSTRAINT project_activity_schedule_status_check
        CHECK (status IN ('pending','in_progress','completed','delayed','blocked'))
    `);

    // Stage templates tables
    await client.query(`
      CREATE TABLE IF NOT EXISTS stage_templates (
        id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name         VARCHAR(200) NOT NULL,
        description  TEXT,
        project_type VARCHAR(50),
        created_by   UUID REFERENCES users(id),
        created_at   TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS stage_template_items (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        template_id   UUID REFERENCES stage_templates(id) ON DELETE CASCADE,
        title         VARCHAR(300) NOT NULL,
        phase_group   VARCHAR(100),
        sort_order    INT DEFAULT 0,
        weight        NUMERIC(5,2) DEFAULT 1,
        duration_days INT DEFAULT 0
      )
    `);

    // Audit logs table
    await client.query(`
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
      )
    `);

    // Drive link column for stage rows
    await client.query(`
      ALTER TABLE project_activity_schedule
        ADD COLUMN IF NOT EXISTS drive_link TEXT
    `);

    // Indexes (all IF NOT EXISTS)
    await client.query(`CREATE INDEX IF NOT EXISTS idx_audit_entity  ON audit_logs(entity_type, entity_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_audit_user    ON audit_logs(user_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_pas_project_status ON project_activity_schedule(project_id, status)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_pas_phase          ON project_activity_schedule(project_id, phase)`);

    // ── Attendance module tables ─────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS attendance (
        id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id                UUID REFERENCES users(id) ON DELETE CASCADE,
        date                   DATE NOT NULL,
        clock_in_time          TIMESTAMPTZ,
        clock_out_time         TIMESTAMPTZ,
        total_hours            NUMERIC(5,2),
        status                 VARCHAR(20) DEFAULT 'present',
        clock_in_lat           NUMERIC(11,8),
        clock_in_lng           NUMERIC(11,8),
        clock_out_lat          NUMERIC(11,8),
        clock_out_lng          NUMERIC(11,8),
        clock_in_inside_fence  BOOLEAN DEFAULT true,
        clock_out_inside_fence BOOLEAN DEFAULT true,
        clock_in_selfie        TEXT,
        clock_out_selfie       TEXT,
        early_logout           BOOLEAN DEFAULT false,
        early_logout_note      TEXT,
        is_flagged             BOOLEAN DEFAULT false,
        flagged_reason         TEXT,
        created_at             TIMESTAMPTZ DEFAULT NOW(),
        updated_at             TIMESTAMPTZ DEFAULT NOW(),
        CONSTRAINT attendance_user_date_unique UNIQUE (user_id, date),
        CONSTRAINT attendance_status_check CHECK (
          status IN ('present','late','absent','leave','holiday','sunday','half_day')
        )
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS leave_requests (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
        start_date  DATE NOT NULL,
        end_date    DATE NOT NULL,
        num_days    INT  NOT NULL,
        reason      TEXT NOT NULL,
        status      VARCHAR(20) DEFAULT 'pending',
        reviewed_by UUID REFERENCES users(id),
        reviewed_at TIMESTAMPTZ,
        review_note TEXT,
        created_at  TIMESTAMPTZ DEFAULT NOW(),
        CONSTRAINT leave_status_check CHECK (status IN ('pending','approved','rejected'))
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS company_holidays (
        id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        date       DATE UNIQUE NOT NULL,
        name       VARCHAR(200) NOT NULL,
        created_by UUID REFERENCES users(id),
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.query(`CREATE INDEX IF NOT EXISTS idx_attendance_user_date ON attendance(user_id, date)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_leave_user           ON leave_requests(user_id, status)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_holiday_date         ON company_holidays(date)`);

    console.log('✅ Auto-migrations applied (stage engine + attendance tables ready)');
  } catch (err) {
    console.error('⚠️  Auto-migration warning (non-fatal):', err.message);
  } finally {
    client.release();
  }
}

module.exports = { runAutoMigrations };
