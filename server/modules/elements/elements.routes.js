const router = require('express').Router();
const { authenticate } = require('../../middleware/auth');
const { authorize } = require('../../middleware/role');
const { uploadValidator } = require('../../middleware/uploadValidator');
const multer = require('multer');
const upload = multer({ dest: '/tmp/uploads/' });
const c = require('./elements.controller');

router.use(authenticate);

router.get('/',           c.list);
router.get('/export',     authorize('admin','manager'), c.exportExcel);
router.get('/:id',        c.getOne);
router.post('/',          authorize('admin','manager'), c.create);
router.put('/:id',        authorize('admin','manager'), c.update);
router.patch('/:id/toggle', authorize('admin','manager'), c.toggleActive);
router.post('/import',    authorize('admin','manager'),
  upload.single('file'),
  uploadValidator({
    maxSizeBytes: 20 * 1024 * 1024,
    allowedMimeTypes: [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
    ],
  }),
  c.importExcel
);

module.exports = router;
