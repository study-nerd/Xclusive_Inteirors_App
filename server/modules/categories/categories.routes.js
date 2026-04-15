const router = require('express').Router();
const { authenticate } = require('../../middleware/auth');
const { authorize } = require('../../middleware/role');
const db = require('../../config/db');

router.use(authenticate);

router.get('/', async (req, res) => {
  const { active } = req.query;
  let q = 'SELECT * FROM categories';
  if (active === 'true') q += ' WHERE is_active = true';
  q += ' ORDER BY name ASC';
  const { rows } = await db.query(q);
  res.json({ success: true, data: rows });
});

router.post('/', authorize('admin'), async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(422).json({ success: false, message: 'Name required' });
  const { rows } = await db.query(
    'INSERT INTO categories (name, created_by) VALUES ($1, $2) RETURNING *',
    [name, req.user.id]
  );
  res.status(201).json({ success: true, data: rows[0] });
});

router.put('/:id', authorize('admin'), async (req, res) => {
  const { name } = req.body;
  const { rows } = await db.query(
    'UPDATE categories SET name = COALESCE($1, name) WHERE id = $2 RETURNING *',
    [name, req.params.id]
  );
  res.json({ success: true, data: rows[0] });
});

router.patch('/:id/toggle', authorize('admin'), async (req, res) => {
  const { rows } = await db.query(
    'UPDATE categories SET is_active = NOT is_active WHERE id = $1 RETURNING *',
    [req.params.id]
  );
  res.json({ success: true, data: rows[0] });
});

module.exports = router;
