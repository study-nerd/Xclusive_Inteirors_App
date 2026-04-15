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

module.exports = router;
