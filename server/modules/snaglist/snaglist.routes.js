const router = require('express').Router();
const { authenticate } = require('../../middleware/auth');
const { authorize } = require('../../middleware/role');
const db = require('../../config/db');
const { uploadValidator } = require('../../middleware/uploadValidator');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const imageDir = path.join(__dirname, '../../uploads/snag-images');
const fileDir  = path.join(__dirname, '../../uploads/snag-files');
[imageDir, fileDir].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }) });

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, file.mimetype.startsWith('image/') ? imageDir : fileDir);
  },
  filename: (req, file, cb) => cb(null, `${uuidv4()}${path.extname(file.originalname)}`),
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = [
      'image/jpeg','image/png','image/webp','image/gif',
      'application/pdf','application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ];
    allowed.includes(file.mimetype) ? cb(null, true) : cb(new Error(`File type not allowed`));
  },
});

const uploadFields = upload.fields([{ name: 'images', maxCount: 10 }, { name: 'files', maxCount: 5 }]);

router.use(authenticate);

router.get('/', async (req, res) => {
  const { project_id, status } = req.query;
  let q = `SELECT s.*, p.name AS project_name, u.name AS reported_by_name, v.name AS vendor_name
           FROM snags s
           LEFT JOIN projects p ON p.id = s.project_id
           LEFT JOIN users u ON u.id = s.reported_by
           LEFT JOIN vendors v ON v.id = s.vendor_id
           WHERE 1=1`;
  const params = []; let idx = 1;
  if (project_id) { q += ` AND s.project_id = $${idx++}`; params.push(project_id); }
  if (status)     { q += ` AND s.status = $${idx++}`; params.push(status); }
  if (req.user.role === 'employee') { q += ` AND s.reported_by = $${idx++}`; params.push(req.user.id); }
  q += ' ORDER BY s.created_at DESC';
  const { rows } = await db.query(q, params);
  res.json({ success: true, data: rows });
});

router.get('/:id', async (req, res) => {
  const { rows } = await db.query(
    `SELECT s.*, p.name AS project_name, u.name AS reported_by_name, v.name AS vendor_name
     FROM snags s
     LEFT JOIN projects p ON p.id = s.project_id
     LEFT JOIN users u ON u.id = s.reported_by
     LEFT JOIN vendors v ON v.id = s.vendor_id
     WHERE s.id = $1`, [req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ success: false, message: 'Snag not found' });
  const [images, files] = await Promise.all([
    db.query('SELECT * FROM snag_images WHERE snag_id=$1', [req.params.id]),
    db.query('SELECT * FROM snag_files  WHERE snag_id=$1', [req.params.id]),
  ]);
  res.json({ success: true, data: { ...rows[0], images: images.rows, files: files.rows } });
});

router.post('/',
  uploadFields,
  uploadValidator({
    maxSizeBytes: 20 * 1024 * 1024,
    allowedMimeTypes: [
      'image/jpeg','image/png','image/webp','image/gif',
      'application/pdf','application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ],
  }),
  async (req, res) => {
  const { project_id, area, item_name, description, designer_name } = req.body;
  const { rows } = await db.query(
    'INSERT INTO snags (project_id, reported_by, area, item_name, description, designer_name) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
    [project_id, req.user.id, area, item_name, description, designer_name]
  );
  const snag = rows[0];
  for (const f of (req.files?.images || [])) {
    await db.query('INSERT INTO snag_images (snag_id, file_url) VALUES ($1,$2)', [snag.id, `/uploads/snag-images/${f.filename}`]);
  }
  for (const f of (req.files?.files || [])) {
    const ext = path.extname(f.originalname).replace('.', '').toLowerCase();
    await db.query('INSERT INTO snag_files (snag_id, file_url, file_name, file_type, file_size) VALUES ($1,$2,$3,$4,$5)',
      [snag.id, `/uploads/snag-files/${f.filename}`, f.originalname, ext, f.size]);
  }
  res.status(201).json({ success: true, data: snag });
});

router.patch('/:id', authorize('admin', 'manager'), async (req, res) => {
  const { status, admin_note, vendor_id, date_of_confirmation, date_of_material_supply } = req.body;
  const resolved_by = status === 'resolved' ? req.user.id : undefined;
  const resolved_at = status === 'resolved' ? new Date() : undefined;
  const { rows } = await db.query(
    `UPDATE snags SET status=COALESCE($1,status), admin_note=COALESCE($2,admin_note), vendor_id=COALESCE($3,vendor_id), date_of_confirmation=COALESCE($4,date_of_confirmation), date_of_material_supply=COALESCE($5,date_of_material_supply), resolved_by=COALESCE($6,resolved_by), resolved_at=COALESCE($7,resolved_at) WHERE id=$8 RETURNING *`,
    [status, admin_note, vendor_id, date_of_confirmation, date_of_material_supply, resolved_by, resolved_at, req.params.id]
  );
  res.json({ success: true, data: rows[0] });
});

// Hard delete (admin only)
router.delete('/:id', authorize('admin'), async (req, res) => {
  const { rows } = await db.query('DELETE FROM snags WHERE id=$1 RETURNING id', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ success: false, message: 'Snag not found' });
  res.json({ success: true, message: 'Snag deleted' });
});

module.exports = router;
