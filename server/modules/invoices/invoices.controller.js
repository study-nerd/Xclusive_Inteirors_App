const db = require('../../config/db');
const path = require('path');

// ── Helpers ───────────────────────────────────────────────────
const saveFiles = async (invoiceId, files) => {
  for (const f of files) {
    const ext = path.extname(f.originalname).replace('.', '').toLowerCase();
    await db.query(
      `INSERT INTO invoice_files (invoice_id, file_url, file_name, file_type, file_size)
       VALUES ($1, $2, $3, $4, $5)`,
      [invoiceId, `/uploads/invoices/${f.filename}`, f.originalname, ext, f.size]
    );
  }
};

const fetchWithFiles = async (id) => {
  const { rows } = await db.query(
    `SELECT i.*,
       p.name  AS project_name,
       v.name  AS vendor_name,
       po.po_number,
       u.name  AS uploaded_by_name
     FROM invoices i
     LEFT JOIN projects p        ON p.id  = i.project_id
     LEFT JOIN vendors v         ON v.id  = i.vendor_id
     LEFT JOIN purchase_orders po ON po.id = i.po_id
     LEFT JOIN users u           ON u.id  = i.uploaded_by
     WHERE i.id = $1`, [id]
  );
  if (!rows[0]) return null;
  const { rows: files } = await db.query(
    'SELECT * FROM invoice_files WHERE invoice_id = $1 ORDER BY created_at ASC', [id]
  );
  return { ...rows[0], files };
};

// ── List ──────────────────────────────────────────────────────
const list = async (req, res) => {
  const { project_id, vendor_id, po_id } = req.query;

  let q = `
    SELECT i.*,
      p.name   AS project_name,
      v.name   AS vendor_name,
      po.po_number,
      u.name   AS uploaded_by_name
    FROM invoices i
    LEFT JOIN projects p         ON p.id  = i.project_id
    LEFT JOIN vendors v          ON v.id  = i.vendor_id
    LEFT JOIN purchase_orders po ON po.id = i.po_id
    LEFT JOIN users u            ON u.id  = i.uploaded_by
    WHERE 1=1`;

  const params = []; let idx = 1;
  if (project_id) { q += ` AND i.project_id = $${idx++}`; params.push(project_id); }
  if (vendor_id)  { q += ` AND i.vendor_id  = $${idx++}`; params.push(vendor_id); }
  if (po_id)      { q += ` AND i.po_id      = $${idx++}`; params.push(po_id); }
  q += ' ORDER BY i.created_at DESC';

  const { rows: invoices } = await db.query(q, params);

  // Attach files to each invoice
  for (const inv of invoices) {
    const { rows: files } = await db.query(
      'SELECT * FROM invoice_files WHERE invoice_id = $1 ORDER BY created_at ASC', [inv.id]
    );
    inv.files = files;
  }

  res.json({ success: true, data: invoices });
};

// ── Create ────────────────────────────────────────────────────
const create = async (req, res) => {
  const { project_id, po_id, vendor_id } = req.body;

  const { rows } = await db.query(
    `INSERT INTO invoices (project_id, po_id, vendor_id, uploaded_by)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [project_id || null, po_id || null, vendor_id || null, req.user.id]
  );
  const invoice = rows[0];

  if (req.files?.length) {
    await saveFiles(invoice.id, req.files);
  }

  const full = await fetchWithFiles(invoice.id);
  res.status(201).json({ success: true, data: full });
};

// ── Update status (admin only) ────────────────────────────────
const updateStatus = async (req, res) => {
  const { approved, paid } = req.body;

  // Rule: paid cannot be true if approved is false
  if (paid === true && approved === false) {
    return res.status(400).json({
      success: false,
      message: 'Cannot mark as paid before approving'
    });
  }

  // If toggling paid=true, check current approved state in DB
  if (paid === true && approved === undefined) {
    const { rows } = await db.query('SELECT approved FROM invoices WHERE id=$1', [req.params.id]);
    if (!rows[0]?.approved) {
      return res.status(400).json({
        success: false,
        message: 'Cannot mark as paid — invoice is not yet approved'
      });
    }
  }

  // Build dynamic update
  const updates = []; const values = []; let idx = 1;
  if (approved !== undefined) { updates.push(`approved = $${idx++}`); values.push(approved); }
  if (paid     !== undefined) { updates.push(`paid     = $${idx++}`); values.push(paid); }

  if (!updates.length) return res.status(400).json({ success: false, message: 'Nothing to update' });

  values.push(req.params.id);
  const { rows } = await db.query(
    `UPDATE invoices SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`, values
  );
  if (!rows[0]) return res.status(404).json({ success: false, message: 'Invoice not found' });

  const full = await fetchWithFiles(rows[0].id);
  res.json({ success: true, data: full });
};

// ── Delete invoice (admin only) ───────────────────────────────
const hardDelete = async (req, res) => {
  const { rows } = await db.query(
    'DELETE FROM invoices WHERE id = $1 RETURNING id', [req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ success: false, message: 'Invoice not found' });
  res.json({ success: true, message: 'Invoice deleted' });
};

// ── Add files to existing invoice ────────────────────────────
const addFiles = async (req, res) => {
  if (!req.files?.length) {
    return res.status(400).json({ success: false, message: 'No files uploaded' });
  }
  await saveFiles(req.params.id, req.files);
  const full = await fetchWithFiles(req.params.id);
  res.json({ success: true, data: full });
};

// ── Delete single file (admin only) ──────────────────────────
const deleteFile = async (req, res) => {
  const { rows } = await db.query(
    'DELETE FROM invoice_files WHERE id = $1 RETURNING id', [req.params.fileId]
  );
  if (!rows[0]) return res.status(404).json({ success: false, message: 'File not found' });
  res.json({ success: true, message: 'File deleted' });
};

module.exports = { list, create, updateStatus, hardDelete, addFiles, deleteFile };
