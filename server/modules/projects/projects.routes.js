const router = require('express').Router();
const { authenticate } = require('../../middleware/auth');
const { authorize } = require('../../middleware/role');
const { uploadValidator } = require('../../middleware/uploadValidator');
const multer = require('multer');
const upload = multer({ dest: '/tmp/' });
const c = require('./projects.controller');

router.use(authenticate);

router.get('/',                              c.list);
// FIX: static routes before /:id
router.get('/template/download',             authorize('admin', 'manager'), c.downloadTemplate);
router.post('/import',                       authorize('admin', 'manager'),
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

router.get('/:id',                           c.getOne);
router.post('/',                             authorize('admin', 'manager'), c.create);
router.put('/:id',                           authorize('admin', 'manager'), c.update);
router.patch('/:id/status',                  authorize('admin', 'manager'), c.updateStatus);
router.delete('/:id',                        authorize('admin'), c.hardDelete);

// Team
router.post('/:id/team',                     authorize('admin', 'manager'), c.addTeamMember);
router.delete('/:id/team/:userId',           authorize('admin', 'manager'), c.removeTeamMember);

// Contractors
router.post('/:id/contractors',              authorize('admin', 'manager'), c.upsertContractor);
router.delete('/:id/contractors/:cid',       authorize('admin', 'manager'), c.removeContractor);

// Activity schedule
router.get('/:id/schedule',                  c.getSchedule);
router.patch('/:id/schedule/:sid',           c.updateScheduleItem);
router.post('/:id/schedule/generate',        authorize('admin', 'manager'), c.generateSchedule);

module.exports = router;
