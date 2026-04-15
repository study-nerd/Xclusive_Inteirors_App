const router = require('express').Router();
const { authenticate } = require('../../middleware/auth');
const { authorize } = require('../../middleware/role');
const db = require('../../config/db');

router.use(authenticate);

// ── Templates (admin only) ──────────────────────────────────
router.get('/templates', async (req, res) => {
  const { rows } = await db.query('SELECT * FROM checklist_templates ORDER BY name ASC');
  res.json({ success: true, data: rows });
});

router.get('/templates/:id', async (req, res) => {
  const [tmpl, items] = await Promise.all([
    db.query('SELECT * FROM checklist_templates WHERE id=$1', [req.params.id]),
    db.query('SELECT * FROM checklist_template_items WHERE template_id=$1 ORDER BY sort_order ASC', [req.params.id]),
  ]);
  res.json({ success: true, data: { ...tmpl.rows[0], items: items.rows } });
});

router.post('/templates', authorize('admin'), async (req, res) => {
  const { name, items = [] } = req.body;
  const { rows } = await db.query(
    'INSERT INTO checklist_templates (name, created_by) VALUES ($1,$2) RETURNING *',
    [name, req.user.id]
  );
  const tmpl = rows[0];
  for (let i = 0; i < items.length; i++) {
    await db.query(
      'INSERT INTO checklist_template_items (template_id, task_name, sort_order) VALUES ($1,$2,$3)',
      [tmpl.id, items[i], i]
    );
  }
  res.status(201).json({ success: true, data: tmpl });
});

// ── Project Checklists ──────────────────────────────────────
router.get('/project/:projectId', async (req, res) => {
  const { rows: checklists } = await db.query(
    `SELECT pc.*, ct.name AS template_name FROM project_checklists pc
     LEFT JOIN checklist_templates ct ON ct.id = pc.template_id
     WHERE pc.project_id = $1`, [req.params.projectId]
  );
  for (const cl of checklists) {
    const { rows: items } = await db.query(
      `SELECT pci.*, u.name AS completed_by_name FROM project_checklist_items pci
       LEFT JOIN users u ON u.id = pci.completed_by
       WHERE pci.project_checklist_id = $1 ORDER BY pci.sort_order ASC`, [cl.id]
    );
    cl.items = items;
  }
  res.json({ success: true, data: checklists });
});

// Assign template to project (generates checklist instance)
router.post('/project/:projectId/assign', authorize('admin','manager'), async (req, res) => {
  const { template_id } = req.body;
  const { rows } = await db.query(
    'INSERT INTO project_checklists (project_id, template_id) VALUES ($1,$2) RETURNING *',
    [req.params.projectId, template_id]
  );
  const cl = rows[0];

  const { rows: templateItems } = await db.query(
    'SELECT * FROM checklist_template_items WHERE template_id=$1 ORDER BY sort_order ASC',
    [template_id]
  );
  for (const ti of templateItems) {
    await db.query(
      'INSERT INTO project_checklist_items (project_checklist_id, task_name, sort_order) VALUES ($1,$2,$3)',
      [cl.id, ti.task_name, ti.sort_order]
    );
  }
  res.status(201).json({ success: true, data: cl });
});

// Mark checklist item complete/incomplete
router.patch('/items/:itemId', async (req, res) => {
  const { is_completed } = req.body;
  const { rows } = await db.query(
    `UPDATE project_checklist_items SET
       is_completed = $1,
       completed_by = $2,
       completed_at = $3
     WHERE id = $4 RETURNING *`,
    [is_completed, is_completed ? req.user.id : null, is_completed ? new Date() : null, req.params.itemId]
  );
  res.json({ success: true, data: rows[0] });
});

module.exports = router;
