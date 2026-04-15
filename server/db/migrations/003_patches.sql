-- Patch: add duration_days to project_activity_schedule
ALTER TABLE project_activity_schedule ADD COLUMN IF NOT EXISTS duration_days INT DEFAULT 0;
ALTER TABLE project_activity_schedule ADD COLUMN IF NOT EXISTS dependency_condition VARCHAR(30);
-- Add unique constraint to project_contractors
ALTER TABLE project_contractors ADD CONSTRAINT project_contractors_project_trade_unique UNIQUE (project_id, trade);
