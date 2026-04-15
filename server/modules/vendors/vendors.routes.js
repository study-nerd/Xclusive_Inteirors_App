const router = require('express').Router();
const { body } = require('express-validator');
const { authenticate } = require('../../middleware/auth');
const { authorize } = require('../../middleware/role');
const { validate } = require('../../utils/validate');
const { uploadValidator } = require('../../middleware/uploadValidator');
const multer = require('multer');
const upload = multer({ dest: '/tmp/' });
const c = require('./vendors.controller');

router.use(authenticate);

router.get('/',                         c.list);
// FIX: static routes must come before /:id to avoid being caught as a param
router.get('/categories',               c.listCategories);
router.post('/categories',              authorize('admin'), [body('name').notEmpty()], validate, c.createCategory);
router.get('/export',                   authorize('admin', 'manager'), c.exportExcel);
router.get('/template/download',        authorize('admin', 'manager'), c.downloadTemplate);
router.post('/import',                  authorize('admin', 'manager'),
  upload.single('file'),
  uploadValidator({
    maxSizeBytes: 20 * 1024 * 1024,
    allowedMimeTypes: [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
    ],
  }),
  c.bulkImport
);

router.get('/:id',                      c.getOne);
router.post('/',                        authorize('admin', 'manager'),
  [body('name').notEmpty()], validate, c.create);
router.put('/:id',                      authorize('admin', 'manager'), c.update);
router.patch('/:id/toggle',             authorize('admin', 'manager'), c.toggleActive);
router.delete('/:id',                   authorize('admin'), c.hardDelete);

module.exports = router;
