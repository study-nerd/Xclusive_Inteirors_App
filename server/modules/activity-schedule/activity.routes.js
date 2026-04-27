const router = require('express').Router();
const { authenticate } = require('../../middleware/auth');
const { authorize } = require('../../middleware/role');
const db = require('../../config/db');

router.use(authenticate);

router.get('/templates', async (req, res) => {
  const { project_type } = req.query;
  let q = 'SELECT * FROM activity_schedule_templates WHERE is_active=true';
  const params = [];
  if (project_type) { q += ' AND project_type=$1'; params.push(project_type); }
  q += ' ORDER BY step_number ASC';
  const { rows } = await db.query(q, params);
  res.json({ success: true, data: rows });
});

router.get('/project-types', (req, res) => {
  res.json({ success: true, data: [
    '2BHK','2.5BHK','3BHK','3.5BHK','4BHK','4.5BHK',
    '5BHK','5.5BHK','6BHK',
    '3BHK_Bungalow','4BHK_Bungalow','5BHK_Bungalow',
    '6BHK_Bungalow','6BHK_Plus_Bungalow','Commercial'
  ]});
});

// ── Standard template CRUD (activity_schedule_templates) ──────────────────

// Add a new row to a project_type template
router.post('/templates', authorize('admin'), async (req, res) => {
  const { project_type, milestone_name, phase, duration_days, dependency_condition } = req.body;
  if (!project_type || !milestone_name) {
    return res.status(400).json({ success: false, message: 'project_type and milestone_name are required' });
  }
  // Get next step_number for this project_type
  const { rows: last } = await db.query(
    'SELECT MAX(step_number) AS max_step FROM activity_schedule_templates WHERE project_type=$1',
    [project_type]
  );
  const nextStep = (last[0]?.max_step || 0) + 1;
  const { rows } = await db.query(
    `INSERT INTO activity_schedule_templates
       (project_type, milestone_name, phase, duration_days, dependency_condition, step_number, activity_no, is_active)
     VALUES ($1,$2,$3,$4,$5,$6,$7,true) RETURNING *`,
    [project_type, milestone_name, phase || null, duration_days || 0, dependency_condition || '', nextStep, String(nextStep)]
  );
  res.status(201).json({ success: true, data: rows[0] });
});

// Update a single template row
router.put('/templates/:id', authorize('admin'), async (req, res) => {
  const { milestone_name, phase, duration_days, dependency_condition, step_number } = req.body;
  const fields = { milestone_name, phase, duration_days, dependency_condition, step_number };
  const updates = []; const values = []; let idx = 1;
  for (const [k, v] of Object.entries(fields)) {
    if (v !== undefined) { updates.push(`${k} = $${idx++}`); values.push(v); }
  }
  if (!updates.length) return res.status(400).json({ success: false, message: 'Nothing to update' });
  values.push(req.params.id);
  const { rows } = await db.query(
    `UPDATE activity_schedule_templates SET ${updates.join(', ')} WHERE id=$${idx} RETURNING *`,
    values
  );
  if (!rows[0]) return res.status(404).json({ success: false, message: 'Template row not found' });
  res.json({ success: true, data: rows[0] });
});

// Delete a single template row
router.delete('/templates/:id', authorize('admin'), async (req, res) => {
  const { rows } = await db.query(
    'DELETE FROM activity_schedule_templates WHERE id=$1 RETURNING id',
    [req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ success: false, message: 'Template row not found' });
  res.json({ success: true });
});

module.exports = router;
