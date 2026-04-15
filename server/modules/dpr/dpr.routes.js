const router = require('express').Router();
const { authenticate } = require('../../middleware/auth');
const { authorize } = require('../../middleware/role');
const db = require('../../config/db');
const { uploadValidator } = require('../../middleware/uploadValidator');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

// ── FIX: use absolute paths so Docker can always find the folders ──
const IMAGE_DIR = path.join(__dirname, '../../uploads/dpr-images');
const VOICE_DIR = path.join(__dirname, '../../uploads/dpr-voice');
[IMAGE_DIR, VOICE_DIR].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, file.mimetype.startsWith('audio') ? VOICE_DIR : IMAGE_DIR);
  },
  filename: (req, file, cb) => cb(null, `${uuidv4()}${path.extname(file.originalname)}`),
});

const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } });

router.use(authenticate);

// ── List ──────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  const { project_id, user_id, date } = req.query;
  let q = `SELECT d.*, p.name AS project_name, u.name AS submitted_by_name
           FROM dprs d
           LEFT JOIN projects p ON p.id = d.project_id
           LEFT JOIN users u ON u.id = d.submitted_by
           WHERE 1=1`;
  const params = []; let idx = 1;
  if (project_id) { q += ` AND d.project_id = $${idx++}`; params.push(project_id); }
  if (user_id)    { q += ` AND d.submitted_by = $${idx++}`; params.push(user_id); }
  if (date)       { q += ` AND d.report_date = $${idx++}`; params.push(date); }
  if (req.user.role === 'employee') { q += ` AND d.submitted_by = $${idx++}`; params.push(req.user.id); }
  q += ' ORDER BY d.report_date DESC';
  const { rows } = await db.query(q, params);
  res.json({ success: true, data: rows });
});

// ── Get one ───────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  const { rows } = await db.query(
    `SELECT d.*, p.name AS project_name, u.name AS submitted_by_name
     FROM dprs d
     LEFT JOIN projects p ON p.id = d.project_id
     LEFT JOIN users u ON u.id = d.submitted_by
     WHERE d.id = $1`, [req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ success: false, message: 'DPR not found' });

  const [images, voice] = await Promise.all([
    db.query('SELECT * FROM dpr_images WHERE dpr_id=$1', [req.params.id]),
    db.query('SELECT * FROM dpr_voice_notes WHERE dpr_id=$1', [req.params.id]),
  ]);
  res.json({ success: true, data: { ...rows[0], images: images.rows, voice_notes: voice.rows } });
});

// ── Submit DPR ────────────────────────────────────────────────
router.post('/',
  upload.fields([{ name: 'images', maxCount: 10 }, { name: 'voice', maxCount: 3 }]),
  uploadValidator({
    maxSizeBytes: 20 * 1024 * 1024,
    allowedMimeTypes: [
      'image/jpeg',
      'image/png',
      'image/webp',
      'audio/mpeg',
      'audio/mp3',
      'audio/wav',
      'audio/x-wav',
      'audio/ogg',
      'audio/webm',
      'audio/mp4',
      'audio/aac',
      'audio/3gpp',
      'audio/3gpp2',
    ],
  }),
  async (req, res) => {
    const {
      project_id, report_date, work_description,
      progress_summary, work_completed, issues_faced, material_used
    } = req.body;

    const { rows } = await db.query(
      `INSERT INTO dprs
         (project_id, submitted_by, report_date, work_description,
          progress_summary, work_completed, issues_faced, material_used)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [project_id, req.user.id, report_date, work_description,
       progress_summary, work_completed, issues_faced, material_used]
    );
    const dpr = rows[0];

    for (const f of (req.files?.images || [])) {
      await db.query('INSERT INTO dpr_images (dpr_id, file_url, file_name) VALUES ($1,$2,$3)',
        [dpr.id, `/uploads/dpr-images/${f.filename}`, f.originalname]);
    }
    for (const f of (req.files?.voice || [])) {
      await db.query('INSERT INTO dpr_voice_notes (dpr_id, file_url, file_name) VALUES ($1,$2,$3)',
        [dpr.id, `/uploads/dpr-voice/${f.filename}`, f.originalname]);
    }

    res.status(201).json({ success: true, data: dpr });
  }
);

// ── Delete DPR (admin only) ───────────────────────────────────
router.delete('/:id', authorize('admin'), async (req, res) => {
  // Cascade deletes images + voice via FK ON DELETE CASCADE
  const { rows } = await db.query(
    'DELETE FROM dprs WHERE id = $1 RETURNING id', [req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ success: false, message: 'DPR not found' });
  res.json({ success: true, message: 'DPR deleted' });
});

module.exports = router;
