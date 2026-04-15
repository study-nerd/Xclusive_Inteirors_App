const router = require('express').Router();
const { authenticate } = require('../../middleware/auth');
const { authorize } = require('../../middleware/role');
const { uploadValidator } = require('../../middleware/uploadValidator');
const c = require('./po.controller');

router.use(authenticate);

// ── Category-aware filtering (for dependent dropdowns) ────
router.get('/vendors-by-category',   c.getVendorsByElementCategory);
router.get('/elements-by-category',  c.getElementsByVendorCategory);


// Line item images
router.post('/line-items/:id/images',
  c.lineItemImagesUpload,
  uploadValidator({
    maxSizeBytes: 2 * 1024 * 1024,
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
  }),
  c.uploadLineItemImages
);

// ── Standard CRUD ─────────────────────────────────────────
router.get('/',              c.list);
router.get('/:id',           c.getOne);
router.post('/',             c.create);
router.put('/:id',           c.update);
router.post('/:id/submit',   c.submit);
router.post('/:id/approve',  authorize('admin'), c.approve);
router.post('/:id/reject',   authorize('admin'), c.reject);
router.get('/:id/pdf',       c.downloadPdf);
router.delete('/:id',        authorize('admin'), c.hardDelete);

// ── Goods Receipt ─────────────────────────────────────────
router.post('/:id/receipt',  c.submitGoodsReceipt);

module.exports = router;
