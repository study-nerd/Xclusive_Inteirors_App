const router = require('express').Router();
const { body } = require('express-validator');
const { authenticate } = require('../../middleware/auth');
const { authorize } = require('../../middleware/role');
const { validate } = require('../../utils/validate');
const { uploadValidator } = require('../../middleware/uploadValidator');
const multer = require('multer');
const upload = multer({ dest: '/tmp/' });
const c = require('./users.controller');

router.use(authenticate);

router.get('/',    authorize('admin', 'manager'), c.list);
router.get('/me',  c.getMe);
router.get('/:id', authorize('admin', 'manager'), c.getOne);

router.post('/',   authorize('admin', 'manager'),
  [body('name').notEmpty(), body('email').isEmail(),
   body('password').isLength({ min: 6 }),
   body('role').isIn(['admin', 'manager', 'employee'])],
  validate, c.create);

router.put('/:id', authorize('admin', 'manager'),
  [body('name').optional().notEmpty(),
   body('email').optional().isEmail(),
   body('role').optional().isIn(['admin', 'manager', 'employee'])],
  validate, c.update);

// Admin resets any user's password (unlimited)
router.patch('/:id/reset-password', authorize('admin', 'manager'),
  [body('password').isLength({ min: 6 })], validate, c.resetPassword);

// Self password change — one time for non-admin users
router.patch('/me/change-password',
  [body('current_password').notEmpty(),
   body('new_password').isLength({ min: 6 })],
  validate, c.changeOwnPassword);

router.patch('/:id/toggle', authorize('admin'), c.toggleActive);
router.delete('/:id',       authorize('admin'), c.hardDelete);

router.post('/import',      authorize('admin', 'manager'),
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
router.get('/template/download', authorize('admin', 'manager'), c.downloadTemplate);

module.exports = router;
