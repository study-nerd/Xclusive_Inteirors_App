const db = require('../../config/db');
const { generatePOPdf, generateReceiptPdf } = require('../../utils/pdf');
const { sendPOEmail } = require('../../utils/email');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');

// ── Category mapping: element category → vendor categories ──
// When user selects an element category, these vendor categories match
const ELEMENT_TO_VENDOR_CATEGORIES = {
  'Carpentry':               ['Carpentry', 'Hardware/Carpentry'],
  'Hardware':                ['Hardware', 'Hardware/Carpentry'],
  'Electrical':              ['Electrical'],
  'Plumbing Sanitary Fitting': ['Plumbing Sanitary Fitting', 'Civil/Plumbing'],
  'Civil':                   ['Civil', 'Civil/Plumbing', 'Roofing'],
};

// Reverse map: vendor category → element categories
const VENDOR_TO_ELEMENT_CATEGORIES = {
  'Carpentry':               ['Carpentry'],
  'Hardware':                ['Hardware'],
  'Electrical':              ['Electrical'],
  'Plumbing Sanitary Fitting': ['Plumbing Sanitary Fitting'],
  'Civil':                   ['Civil'],
  'Roofing':                 ['Civil'],
  'Hardware/Carpentry':      ['Hardware', 'Carpentry'],
  'Civil/Plumbing':          ['Civil', 'Plumbing Sanitary Fitting'],
};

const PO_ITEM_DIR = path.join(__dirname, '../../uploads/po-items');
if (!fs.existsSync(PO_ITEM_DIR)) fs.mkdirSync(PO_ITEM_DIR, { recursive: true });

const CHALLAN_DIR = path.join(__dirname, '../../uploads/challans');
if (!fs.existsSync(CHALLAN_DIR)) fs.mkdirSync(CHALLAN_DIR, { recursive: true });

const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const lineItemStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, PO_ITEM_DIR),
  filename: (req, file, cb) => cb(null, `${uuidv4()}${path.extname(file.originalname)}`),
});

const lineItemUpload = multer({
  storage: lineItemStorage,
  limits: { fileSize: 2 * 1024 * 1024, files: 5 },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_IMAGE_TYPES.has(file.mimetype)) return cb(null, true);
    return cb(new Error('Only JPG, PNG, or WEBP images are allowed'));
  },
});

const lineItemImagesUpload = (req, res, next) => {
  lineItemUpload.array('images', 5)(req, res, (err) => {
    if (err) {
      return res.status(400).json({ success: false, message: err.message });
    }
    next();
  });
};

const ALLOWED_CHALLAN_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
const challanStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, CHALLAN_DIR),
  filename: (req, file, cb) => cb(null, `${uuidv4()}${path.extname(file.originalname)}`),
});
const challanUpload = multer({
  storage: challanStorage,
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_CHALLAN_TYPES.has(file.mimetype)) return cb(null, true);
    return cb(new Error('Only JPG, PNG, WEBP, or PDF allowed for challan'));
  },
});
const challanImageUpload = (req, res, next) => {
  challanUpload.single('challan')(req, res, (err) => {
    if (err) return res.status(400).json({ success: false, message: err.message });
    next();
  });
};

const generatePoNumber = async () => {
  const now = new Date();
  const yr = now.getFullYear().toString().slice(-2);
  const nextYr = (parseInt(yr) + 1).toString();
  const prefix = `PO/${yr}-${nextYr}/`;
  const { rows } = await db.query(
    `SELECT po_number FROM purchase_orders WHERE po_number LIKE $1 ORDER BY created_at DESC LIMIT 1`,
    [`${prefix}%`]
  );
  const last = rows[0]?.po_number;
  const num = last ? parseInt(last.split('/').pop()) + 1 : 1;
  return `${prefix}${String(num).padStart(5, '0')}`;
};

const fetchFullPO = async (id) => {
  const { rows } = await db.query(`
    SELECT po.*,
      p.name AS project_name, p.code AS project_code, p.site_address,
      v.name AS vendor_name, v.email AS vendor_email, v.phone AS vendor_phone,
      v.address AS vendor_address, v.gstin AS vendor_gstin, v.pan AS vendor_pan,
      v.bank_account_holder AS vendor_bank_account_holder,
      v.bank_account_number AS vendor_bank_account_number,
      v.bank_ifsc AS vendor_bank_ifsc, v.bank_name AS vendor_bank_name,
      u.name AS poc_name, u.email AS poc_email,
      creator.name AS created_by_name, creator.email AS created_by_email,
      submitter.name AS receipt_submitted_by_name,
      verifier.name AS receipt_verified_by_name
    FROM purchase_orders po
    LEFT JOIN projects p       ON p.id  = po.project_id
    LEFT JOIN vendors v        ON v.id  = po.vendor_id
    LEFT JOIN users u          ON u.id  = po.order_poc_user_id
    LEFT JOIN users creator    ON creator.id = po.created_by
    LEFT JOIN users submitter  ON submitter.id = po.receipt_submitted_by
    LEFT JOIN users verifier   ON verifier.id = po.receipt_verified_by
    WHERE po.id = $1`, [id]);

  if (!rows[0]) return null;
  const po = rows[0];

  const { rows: items } = await db.query(`
    SELECT pli.*,
      c.name AS category_name,
      gr.received_qty,
      gr.side_note AS receipt_note,
      gr.submitted_at AS receipt_item_submitted_at,
      COALESCE(img.images, '[]'::json) AS images
    FROM po_line_items pli
    LEFT JOIN categories c ON c.id = pli.category_id
    LEFT JOIN po_goods_receipt gr ON gr.line_item_id = pli.id AND gr.po_id = $1
    LEFT JOIN (
      SELECT line_item_id, JSON_AGG(image_url ORDER BY created_at ASC) AS images
      FROM line_item_images
      GROUP BY line_item_id
    ) img ON img.line_item_id = pli.id
    WHERE pli.po_id = $1
    ORDER BY pli.sort_order ASC`, [id]);

  po.line_items = items;
  return po;
};

// ── Get vendors filtered by element category ─────────────
const getVendorsByElementCategory = async (req, res) => {
  const { element_category } = req.query;

  if (!element_category) {
    const { rows } = await db.query(
      'SELECT id, name, category, phone, email, address FROM vendors WHERE is_active=true ORDER BY name ASC'
    );
    return res.json({ success: true, data: rows });
  }

  const vendorCats = ELEMENT_TO_VENDOR_CATEGORIES[element_category] || [];

  if (!vendorCats.length) {
    // No mapping — return all vendors
    const { rows } = await db.query(
      'SELECT id, name, category, phone, email, address FROM vendors WHERE is_active=true ORDER BY name ASC'
    );
    return res.json({ success: true, data: rows });
  }

  const placeholders = vendorCats.map((_, i) => `$${i + 1}`).join(',');
  const { rows } = await db.query(
    `SELECT id, name, category, phone, email, address FROM vendors
     WHERE is_active=true AND category = ANY($1::text[])
     ORDER BY name ASC`,
    [vendorCats]
  );
  res.json({ success: true, data: rows });
};

// ── Get elements filtered by vendor category ─────────────
const getElementsByVendorCategory = async (req, res) => {
  const { vendor_category } = req.query;

  if (!vendor_category) {
    const { rows } = await db.query(
      `SELECT e.*, c.name AS category_name FROM elements e
       LEFT JOIN categories c ON c.id = e.category_id
       WHERE e.is_active=true ORDER BY e.name ASC`
    );
    return res.json({ success: true, data: rows });
  }

  const elementCats = VENDOR_TO_ELEMENT_CATEGORIES[vendor_category] || [];

  if (!elementCats.length) {
    const { rows } = await db.query(
      `SELECT e.*, c.name AS category_name FROM elements e
       LEFT JOIN categories c ON c.id = e.category_id
       WHERE e.is_active=true ORDER BY e.name ASC`
    );
    return res.json({ success: true, data: rows });
  }

  const { rows } = await db.query(
    `SELECT e.*, c.name AS category_name FROM elements e
     LEFT JOIN categories c ON c.id = e.category_id
     WHERE e.is_active=true AND c.name = ANY($1::text[])
     ORDER BY e.name ASC`,
    [elementCats]
  );
  res.json({ success: true, data: rows });
};

const list = async (req, res) => {
  const { project_id, vendor_id, status, created_by } = req.query;
  let q = `SELECT po.*, p.name AS project_name, v.name AS vendor_name, u.name AS created_by_name
           FROM purchase_orders po
           LEFT JOIN projects p ON p.id = po.project_id
           LEFT JOIN vendors v  ON v.id = po.vendor_id
           LEFT JOIN users u    ON u.id = po.created_by
           WHERE 1=1`;
  const params = []; let idx = 1;
  if (project_id) { q += ` AND po.project_id = $${idx++}`; params.push(project_id); }
  if (vendor_id)  { q += ` AND po.vendor_id = $${idx++}`; params.push(vendor_id); }
  if (status)     { q += ` AND po.status = $${idx++}`; params.push(status); }
  if (created_by) { q += ` AND po.created_by = $${idx++}`; params.push(created_by); }
  if (req.user.role === 'admin') { q += ` AND po.status != 'draft'`; }
  q += ' ORDER BY po.created_at DESC';
  const { rows } = await db.query(q, params);
  res.json({ success: true, data: rows });
};

const getOne = async (req, res) => {
  const po = await fetchFullPO(req.params.id);
  if (!po) return res.status(404).json({ success: false, message: 'PO not found' });
  res.json({ success: true, data: po });
};

const create = async (req, res) => {
  const { project_id, vendor_id, order_poc_user_id: incoming_poc_id, work_start_date,
    work_end_date, payment_terms, other_terms, line_items = [] } = req.body;

  const po_number = await generatePoNumber();
    let order_poc_user_id
    if (req.user.role === 'admin') {
      order_poc_user_id = incoming_poc_id || null
    } else {
      order_poc_user_id = req.user.id
    }
    
  const { rows } = await db.query(
    `INSERT INTO purchase_orders
       (po_number, project_id, vendor_id, created_by, order_poc_user_id,
        work_start_date, work_end_date, payment_terms, other_terms, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'draft') RETURNING *`,
    [po_number, project_id, vendor_id, req.user.id, order_poc_user_id,
     work_start_date, work_end_date, payment_terms, other_terms]
  );
  const po = rows[0];
  if (line_items.length) await _saveLineItems(po.id, line_items);
  await _recalcTotals(po.id);
  const full = await fetchFullPO(po.id);
  res.status(201).json({ success: true, data: full });
};

const update = async (req, res) => {
  const { rows: existing } = await db.query(
    'SELECT status FROM purchase_orders WHERE id = $1', [req.params.id]
  );
  if (!existing[0]) return res.status(404).json({ success: false, message: 'PO not found' });

  const isAdmin   = req.user.role === 'admin';
  const isDraft   = existing[0].status === 'draft';
  const isPending = existing[0].status === 'pending_approval';

  if (!isDraft && !(isAdmin && isPending)) {
    return res.status(403).json({ success: false, message: 'Cannot edit a locked PO' });
  }

  const { project_id, vendor_id, order_poc_user_id: incoming_poc_id, work_start_date,
    work_end_date, payment_terms, other_terms, line_items } = req.body;

  let order_poc_user_id
  if (req.user.role === 'admin') {
    order_poc_user_id = incoming_poc_id || null
  } else {
    order_poc_user_id = req.user.id
  }

  await db.query(
    `UPDATE purchase_orders SET
       project_id        = COALESCE($1, project_id),
       vendor_id         = COALESCE($2, vendor_id),
       order_poc_user_id = COALESCE($3, order_poc_user_id),
       work_start_date   = COALESCE($4, work_start_date),
       work_end_date     = COALESCE($5, work_end_date),
       payment_terms     = COALESCE($6, payment_terms),
       other_terms       = COALESCE($7, other_terms),
       updated_at        = NOW()
     WHERE id = $8`,
    [project_id, vendor_id, order_poc_user_id, work_start_date,
     work_end_date, payment_terms, other_terms, req.params.id]
  );

  if (line_items) {
    await db.query('DELETE FROM po_line_items WHERE po_id = $1', [req.params.id]);
    await _saveLineItems(req.params.id, line_items);
    await _recalcTotals(req.params.id);
  }

  const full = await fetchFullPO(req.params.id);
  res.json({ success: true, data: full });
};

const submit = async (req, res) => {
  const { rows } = await db.query(
    `UPDATE purchase_orders SET status='pending_approval', submitted_at=NOW(), updated_at=NOW()
     WHERE id=$1 AND status='draft' AND created_by=$2 RETURNING *`,
    [req.params.id, req.user.id]
  );
  if (!rows[0]) return res.status(400).json({
    success: false, message: 'PO not found or not in draft state'
  });
  res.json({ success: true, data: rows[0] });
};

const approve = async (req, res) => {
  const po = await fetchFullPO(req.params.id);
  if (!po) return res.status(404).json({ success: false, message: 'PO not found' });
  if (po.status !== 'pending_approval') {
    return res.status(400).json({ success: false, message: 'PO is not pending approval' });
  }

  const safeFilename = po.po_number.replace(/\//g, '-');
  const relativePdfPath = `/uploads/po-pdfs/${safeFilename}.pdf`;

  try {
    const pdfPath = await generatePOPdf(po);

    await db.query(
      `UPDATE purchase_orders SET
         status='approved', approved_at=NOW(), approved_by=$1,
         pdf_path=$2, updated_at=NOW()
       WHERE id=$3`,
      [req.user.id, relativePdfPath, req.params.id]
    );

    // Notify PO creator that PO was approved
    await db.query(
      `INSERT INTO notifications (user_id, type, title, body, po_id)
       VALUES ($1,'po_approved',$2,$3,$4)`,
      [
        po.created_by,
        `✅ PO Approved: ${po.po_number}`,
        `Your purchase order ${po.po_number} for ${po.project_name} has been approved. Please submit goods receipt within 8 days.`,
        po.id,
      ]
    );

    const internalEmails = Array.from(
      new Set([po.created_by_email, req.user.email].filter(Boolean))
    );

    const hasVendorEmail = !!po.vendor_email;
    const toEmails = hasVendorEmail
      ? [po.vendor_email]
      : (internalEmails.length ? [internalEmails[0]] : []);
    const ccEmails = hasVendorEmail
      ? internalEmails
      : internalEmails.slice(1);

    if (toEmails.length) {
      sendPOEmail({
        toEmails,
        ccEmails,
        po,
        pdfPath,
        internalOnly: !hasVendorEmail,
        approvedByName: req.user.name || 'Admin',
      }).then(() => {
        db.query('UPDATE purchase_orders SET email_sent=true WHERE id=$1', [po.id]);
      }).catch(err => console.error('Email failed (non-fatal):', err.message));
    } else {
      console.warn(`PO ${po.po_number}: no valid recipient email found; email skipped.`);
    }

    const full = await fetchFullPO(req.params.id);
    res.json({ success: true, data: full });

  } catch (err) {
    console.error('Approve error:', err);
    res.status(500).json({ success: false, message: `Approval failed: ${err.message}` });
  }
};

const reject = async (req, res) => {
  const { comment } = req.body;
  const { rows } = await db.query(
    `UPDATE purchase_orders SET status='rejected', admin_comment=$1, updated_at=NOW()
     WHERE id=$2 AND status='pending_approval' RETURNING *`,
    [comment, req.params.id]
  );
  if (!rows[0]) return res.status(400).json({ success: false, message: 'PO not pending approval' });

  // Notify creator
  await db.query(
    `INSERT INTO notifications (user_id, type, title, body, po_id)
     VALUES ($1,'po_rejected',$2,$3,$4)`,
    [
      rows[0].created_by,
      `❌ PO Rejected: ${rows[0].po_number}`,
      `Your purchase order was rejected. Reason: ${comment || 'No reason given'}`,
      rows[0].id,
    ]
  );

  res.json({ success: true, data: rows[0] });
};

const downloadPdf = async (req, res) => {
  const { rows } = await db.query(
    'SELECT po_number, pdf_path, status FROM purchase_orders WHERE id=$1', [req.params.id]
  );
  const po = rows[0];
  if (!po) return res.status(404).json({ success: false, message: 'PO not found' });
  if (po.status !== 'approved') return res.status(403).json({
    success: false, message: 'PO not yet approved'
  });

  const filePath = path.join(__dirname, '../../', po.pdf_path);
  if (!fs.existsSync(filePath)) return res.status(404).json({
    success: false, message: 'PDF not found on disk'
  });

  res.download(filePath, `${po.po_number.replace(/\//g, '-')}.pdf`);
};

const hardDelete = async (req, res) => {
  const { rows } = await db.query(
    'DELETE FROM purchase_orders WHERE id=$1 RETURNING id, po_number',
    [req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ success: false, message: 'PO not found' });
  res.json({ success: true, message: `PO ${rows[0].po_number} deleted permanently` });
};

// ── Goods Receipt ─────────────────────────────────────────
const submitGoodsReceipt = async (req, res) => {
  // Support both JSON body and multipart/form-data (items as JSON string)
  let items = req.body.items;
  if (typeof items === 'string') {
    try { items = JSON.parse(items); } catch { items = []; }
  }

  if (!items?.length) {
    return res.status(400).json({ success: false, message: 'No items provided' });
  }

  if (!req.file) {
    return res.status(400).json({ success: false, message: 'Challan image is required' });
  }

  const po = await fetchFullPO(req.params.id);
  if (!po) return res.status(404).json({ success: false, message: 'PO not found' });
  if (po.status !== 'approved') {
    return res.status(400).json({ success: false, message: 'Can only submit receipt for approved POs' });
  }

  if (po.created_by !== req.user.id) {
    return res.status(403).json({ success: false, message: 'Only the PO creator can submit goods receipt' });
  }

  // Validate side notes; null out side_note when quantities match
  for (const item of items) {
    const lineItem = po.line_items.find(li => li.id === item.line_item_id);
    if (!lineItem) continue;
    const poQty   = parseFloat(lineItem.quantity);
    const recvQty = parseFloat(item.received_qty);
    if (!isNaN(recvQty) && recvQty !== poQty && !item.side_note?.trim()) {
      return res.status(400).json({
        success: false,
        message: `Side note required for "${lineItem.item_name}" — received (${recvQty}) differs from PO qty (${poQty})`,
      });
    }
    if (!isNaN(recvQty) && recvQty === poQty) {
      item.side_note = null;
    }
  }

  const challanUrl = `/uploads/challans/${req.file.filename}`;

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    for (const item of items) {
      await client.query(
        `INSERT INTO po_goods_receipt (po_id, line_item_id, received_qty, side_note, submitted_by, challan_image_url)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (po_id, line_item_id) DO UPDATE SET
           received_qty       = EXCLUDED.received_qty,
           side_note          = EXCLUDED.side_note,
           submitted_by       = EXCLUDED.submitted_by,
           challan_image_url  = EXCLUDED.challan_image_url,
           submitted_at       = NOW()`,
        [req.params.id, item.line_item_id, item.received_qty, item.side_note || null, req.user.id, challanUrl]
      );
    }

    await client.query(
      `UPDATE purchase_orders SET
         receipt_submitted     = true,
         receipt_submitted_at  = NOW(),
         receipt_submitted_by  = $1,
         receipt_status        = 'pending',
         receipt_challan_url   = $2,
         updated_at            = NOW()
       WHERE id = $3`,
      [req.user.id, challanUrl, req.params.id]
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  // Notify admins of new receipt submission
  const { rows: admins } = await db.query(
    'SELECT id FROM users WHERE role=$1 AND is_active=true', ['admin']
  );

  // Check for discrepancies
  const discrepancies = items.filter(item => {
    const lineItem = po.line_items.find(li => li.id === item.line_item_id);
    if (!lineItem) return false;
    return parseFloat(item.received_qty) !== parseFloat(lineItem.quantity);
  });

  for (const admin of admins) {
    if (discrepancies.length > 0) {
      await db.query(
        `INSERT INTO notifications (user_id, type, title, body, po_id)
         VALUES ($1,'discrepancy',$2,$3,$4)`,
        [
          admin.id,
          `⚠️ Quantity discrepancy: ${po.po_number}`,
          `Goods receipt for ${po.po_number} has ${discrepancies.length} item(s) with discrepancies. Verify before approving.`,
          po.id,
        ]
      );
    } else {
      await db.query(
        `INSERT INTO notifications (user_id, type, title, body, po_id)
         VALUES ($1,'receipt_pending',$2,$3,$4)`,
        [
          admin.id,
          `📋 Receipt pending verification: ${po.po_number}`,
          `Goods receipt for ${po.po_number} has been submitted and awaits your verification.`,
          po.id,
        ]
      );
    }
  }

  // Late submission notification
  if (po.approved_at) {
    const diffDays = Math.floor((Date.now() - new Date(po.approved_at)) / (1000 * 60 * 60 * 24));
    if (diffDays > 8) {
      const delay = diffDays - 8;
      for (const admin of admins) {
        await db.query(
          `INSERT INTO notifications (user_id, type, title, body, po_id)
           VALUES ($1,'late_receipt',$2,$3,$4)`,
          [
            admin.id,
            `⏰ Late Receipt: ${po.po_number}`,
            `Goods receipt for PO ${po.po_number} was submitted ${delay} day(s) late.`,
            po.id,
          ]
        );
      }
    }
  }

  const full = await fetchFullPO(req.params.id);
  res.json({ success: true, data: full });
};

// ── Verify / Reject Receipt (Admin) ──────────────────────
const verifyReceipt = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body; // 'verified' | 'rejected'

  if (!['verified', 'rejected'].includes(status)) {
    return res.status(400).json({ success: false, message: "Status must be 'verified' or 'rejected'" });
  }

  const { rows } = await db.query(
    `UPDATE purchase_orders
     SET receipt_status       = $1,
         receipt_verified_at  = NOW(),
         receipt_verified_by  = $2,
         updated_at           = NOW()
     WHERE id = $3 AND receipt_submitted = true
     RETURNING *`,
    [status, req.user.id, id]
  );

  if (!rows[0]) {
    return res.status(400).json({ success: false, message: 'Receipt not found or not yet submitted' });
  }

  const po = rows[0];
  const icon = status === 'verified' ? '✅' : '❌';
  const verb = status === 'verified' ? 'verified' : 'rejected';

  await db.query(
    `INSERT INTO notifications (user_id, type, title, body, po_id)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      po.created_by,
      `receipt_${status}`,
      `${icon} Receipt ${verb}: ${po.po_number}`,
      `Your goods receipt for ${po.po_number} has been ${verb} by admin.`,
      po.id,
    ]
  );

  const full = await fetchFullPO(id);
  return res.json({ success: true, message: `Receipt ${verb}`, data: full });
};

// ── Download Receipt PDF (only after verified) ────────────
const downloadReceiptPdf = async (req, res) => {
  const po = await fetchFullPO(req.params.id);
  if (!po) return res.status(404).json({ success: false, message: 'PO not found' });

  if (po.receipt_status !== 'verified') {
    return res.status(400).json({ success: false, message: 'Receipt not yet verified by admin' });
  }

  try {
    const pdfPath = await generateReceiptPdf(po);
    const safeFilename = `${po.po_number.replace(/\//g, '-')}-receipt.pdf`;
    res.download(pdfPath, safeFilename);
  } catch (err) {
    console.error('Receipt PDF error:', err);
    res.status(500).json({ success: false, message: `PDF generation failed: ${err.message}` });
  }
};


// ?? Line Item Images ???????????????????????????????????????????????
const uploadLineItemImages = async (req, res) => {
  const lineItemId = req.params.id;
  const { rows: exists } = await db.query('SELECT id FROM po_line_items WHERE id = $1', [lineItemId]);
  if (!exists[0]) return res.status(404).json({ success: false, message: 'Line item not found' });

  const files = req.files || [];
  if (!files.length) {
    return res.status(400).json({ success: false, message: 'No images uploaded' });
  }

  const { rows: countRows } = await db.query(
    'SELECT COUNT(*)::int AS count FROM line_item_images WHERE line_item_id = $1',
    [lineItemId]
  );
  const existingCount = countRows[0]?.count || 0;
  if (existingCount + files.length > 5) {
    return res.status(400).json({ success: false, message: 'Max 5 images per line item' });
  }

  const inserted = [];
  for (const f of files) {
    const imageUrl = `/uploads/po-items/${f.filename}`;
    const { rows } = await db.query(
      'INSERT INTO line_item_images (line_item_id, image_url) VALUES ($1,$2) RETURNING *',
      [lineItemId, imageUrl]
    );
    inserted.push(rows[0]);
  }

  res.status(201).json({ success: true, data: inserted });
};

// ── Helpers ───────────────────────────────────────────────
const _saveLineItems = async (poId, items) => {
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const qty    = parseFloat(it.quantity)    || 0;
    const rate   = parseFloat(it.rate)        || 0;
    const gst    = parseFloat(it.gst_percent) || 0;
    const base   = qty * rate;
    const gstAmt = base * gst / 100;
    const total  = base + gstAmt;

    await db.query(
      `INSERT INTO po_line_items
         (po_id, element_id, item_name, description, category_id, unit,
          quantity, rate, gst_percent, gst_amount, total, brand_make, is_custom, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [poId, it.element_id || null, it.item_name, it.description,
       it.category_id || null, it.unit, qty, rate, gst, gstAmt, total,
       it.brand_make || null, it.is_custom || false, i]
    );
  }
};

const _recalcTotals = async (poId) => {
  await db.query(`
    UPDATE purchase_orders po SET
      subtotal  = (SELECT COALESCE(SUM(quantity * rate), 0) FROM po_line_items WHERE po_id = po.id),
      gst_total = (SELECT COALESCE(SUM(gst_amount), 0)     FROM po_line_items WHERE po_id = po.id),
      total     = (SELECT COALESCE(SUM(total), 0)          FROM po_line_items WHERE po_id = po.id),
      updated_at = NOW()
    WHERE id = $1`, [poId]);
};

module.exports = {
  list, getOne, create, update, submit, approve, reject,
  downloadPdf, hardDelete,
  submitGoodsReceipt, challanImageUpload, verifyReceipt, downloadReceiptPdf,
  getVendorsByElementCategory, getElementsByVendorCategory,
  lineItemImagesUpload, uploadLineItemImages,
};
