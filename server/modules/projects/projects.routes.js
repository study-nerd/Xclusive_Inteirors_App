const router = require('express').Router();
const { authenticate } = require('../../middleware/auth');
const { authorize } = require('../../middleware/role');
const { uploadValidator } = require('../../middleware/uploadValidator');
const multer = require('multer');
const upload = multer({ dest: '/tmp/' });
const c = require('./projects.controller');

router.use(authenticate);

// Static routes first
router.get('/tracker',                    c.getTrackerData);
router.get('/template/download',          authorize('admin', 'manager'), c.downloadTemplate);
router.get('/stage-templates',            c.getStageTemplates);
router.post('/stage-templates',           authorize('admin', 'manager'), c.createStageTemplate);
router.get('/stage-templates/sample',     c.downloadSampleStageTemplate);
router.post('/stage-templates/import',    authorize('admin', 'manager'), upload.single('file'), c.importStageTemplate);
router.get('/audit-logs',                 authorize('admin', 'manager'), c.getAuditLogs);

router.post('/import', authorize('admin', 'manager'),
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

router.get('/',          c.list);
router.get('/:id',       c.getOne);
router.post('/',         authorize('admin', 'manager'), c.create);
router.put('/:id',       authorize('admin', 'manager'), c.update);
router.patch('/:id/status', authorize('admin', 'manager'), c.updateStatus);
router.delete('/:id',    authorize('admin'), c.hardDelete);

// Team
router.put('/:id/team/bulk',       authorize('admin', 'manager'), c.syncTeamMembers);
router.post('/:id/team',           authorize('admin', 'manager'), c.addTeamMember);
router.delete('/:id/team/:userId', authorize('admin', 'manager'), c.removeTeamMember);

// Contractors
router.post('/:id/contractors',        authorize('admin', 'manager'), c.upsertContractor);
router.delete('/:id/contractors/:cid', authorize('admin', 'manager'), c.removeContractor);

// Legacy activity schedule (kept for compatibility)
router.get('/:id/schedule',          c.getSchedule);
router.patch('/:id/schedule/:sid',   c.updateScheduleItem);
router.post('/:id/schedule/generate', authorize('admin', 'manager'), c.generateSchedule);

// Stages (stage engine)
router.get('/:id/stages',                    c.getStages);
router.post('/:id/stages',                   authorize('admin', 'manager'), c.createStage);
router.put('/:id/stages/:sid',               c.updateStage);
router.delete('/:id/stages/:sid',            authorize('admin', 'manager'), c.deleteStage);
router.post('/:id/stages/apply-template',    authorize('admin', 'manager'), c.applyTemplate);

// Kanban drag/drop advance (any authenticated user — matches stage-update access policy)
router.post('/:id/advance-column',           c.advanceToColumn);

module.exports = router;
