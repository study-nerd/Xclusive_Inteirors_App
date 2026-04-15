const router = require('express').Router();
const { authenticate } = require('../../middleware/auth');
const { authorize } = require('../../middleware/role');
const { uploadValidator } = require('../../middleware/uploadValidator');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const c = require('./invoices.controller');

// ── Upload storage ────────────────────────────────────────────
const uploadDir = path.join(__dirname, '../../uploads/invoices');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename:    (req, file, cb) => cb(null, `${uuidv4()}${path.extname(file.originalname)}`),
});

const upload = multer({
  storage,
  limits: { fileSize: 30 * 1024 * 1024 }, // 30 MB per file
});

router.use(authenticate);

// Invoices
router.get('/',          c.list);
router.post('/',
  upload.array('files', 20),
  uploadValidator({ maxSizeBytes: 30 * 1024 * 1024 }),
  c.create
);
router.put('/:id',       authorize('admin'), c.updateStatus);
router.delete('/:id',    authorize('admin'), c.hardDelete);

// Add more files to existing invoice
router.post('/:id/files',
  upload.array('files', 20),
  uploadValidator({ maxSizeBytes: 30 * 1024 * 1024 }),
  c.addFiles
);

// Delete single file
router.delete('/files/:fileId', authorize('admin'), c.deleteFile);

module.exports = router;
