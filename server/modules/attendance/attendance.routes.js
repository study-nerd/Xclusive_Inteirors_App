const router  = require('express').Router();
const { authenticate } = require('../../middleware/auth');
const { authorize }    = require('../../middleware/role');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const { v4: uuidv4 } = require('uuid');
const c       = require('./attendance.controller');

const selfieDir = path.join(__dirname, '../../uploads/attendance-selfies');
if (!fs.existsSync(selfieDir)) fs.mkdirSync(selfieDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, selfieDir),
  filename:    (req, file, cb) => cb(null, `${uuidv4()}${path.extname(file.originalname)}`),
});
const upload = multer({
  storage,
  limits:     { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) return cb(null, true);
    cb(new Error('Only images are allowed for selfie.'));
  },
});

router.use(authenticate);

// ── Config (any authenticated user) ──────────────────────────────────────────
router.get('/config',       c.getConfig);

// ── Employee / Manager / Admin ────────────────────────────────────────────────
router.get('/today',        c.getToday);
router.get('/my-monthly',   c.getMyMonthly);
router.post('/clock-in',    upload.single('selfie'), c.clockIn);
router.post('/clock-out',   upload.single('selfie'), c.clockOut);

// ── Leave ─────────────────────────────────────────────────────────────────────
router.post('/leave',              c.requestLeave);
router.delete('/leave/:id/cancel', c.cancelLeave);
router.get('/leave/my',            c.getMyLeaves);

// ── Holidays (read for all) ───────────────────────────────────────────────────
router.get('/holidays',            c.getHolidays);

// ── Admin / Manager only ──────────────────────────────────────────────────────
router.use('/admin',               authorize('admin', 'manager'));
router.get('/admin/today',         c.adminTodayOverview);
router.get('/admin/monthly',       c.getAdminMonthly);
router.get('/admin/users',         c.getUsers);

router.get('/leave/pending',       authorize('admin', 'manager'), c.getPendingLeaves);
router.get('/leave/all',           authorize('admin', 'manager'), c.getAllLeaves);
router.patch('/leave/:id/review',  authorize('admin', 'manager'), c.reviewLeave);

router.post('/holidays',           authorize('admin'), c.createHoliday);
router.delete('/holidays/:id',     authorize('admin'), c.deleteHoliday);

module.exports = router;
