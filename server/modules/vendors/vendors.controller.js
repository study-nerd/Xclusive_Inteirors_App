const XLSX = require('xlsx');
const db = require('../../config/db');

const ensureVendorCategories = async () => {
  await db.query(`
    CREATE TABLE IF NOT EXISTS vendor_categories (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name       VARCHAR(100) UNIQUE NOT NULL,
      is_active  BOOLEAN DEFAULT true,
      created_by UUID REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await db.query(`
    INSERT INTO vendor_categories (name, created_by)
    SELECT DISTINCT TRIM(v.category), MIN(v.created_by::text)::uuid
    FROM vendors v
    WHERE v.category IS NOT NULL AND TRIM(v.category) <> ''
    GROUP BY TRIM(v.category)
    ON CONFLICT (name) DO NOTHING
  `);
};

const listCategories = async (req, res) => {
  await ensureVendorCategories();
  const { active } = req.query;
  let q = 'SELECT * FROM vendor_categories';
  if (active === 'true') q += ' WHERE is_active = true';
  q += ' ORDER BY name ASC';
  const { rows } = await db.query(q);
  res.json({ success: true, data: rows });
};

const createCategory = async (req, res) => {
  await ensureVendorCategories();
  const name = String(req.body.name || '').trim();
  if (!name) return res.status(422).json({ success: false, message: 'Category name is required' });

  const { rows } = await db.query(
    `INSERT INTO vendor_categories (name, created_by)
     VALUES ($1, $2)
     ON CONFLICT (name) DO NOTHING
     RETURNING *`,
    [name, req.user.id]
  );

  if (rows[0]) return res.status(201).json({ success: true, data: rows[0] });

  const { rows: existing } = await db.query(
    'SELECT * FROM vendor_categories WHERE name = $1',
    [name]
  );
  res.json({ success: true, data: existing[0] });
};

const validateCategory = async (category) => {
  if (!category) return null;
  await ensureVendorCategories();
  const normalized = String(category).trim();
  if (!normalized) return null;
  const { rows } = await db.query(
    'SELECT name FROM vendor_categories WHERE name = $1',
    [normalized]
  );
  if (!rows[0]) return '__INVALID__';
  return rows[0].name;
};

const list = async (req, res) => {
  const { active } = req.query;
  let q = 'SELECT * FROM vendors';
  if (active === 'true') q += ' WHERE is_active = true';
  q += ' ORDER BY name ASC';
  const { rows } = await db.query(q);
  res.json({ success: true, data: rows });
};

const getOne = async (req, res) => {
  const { rows } = await db.query('SELECT * FROM vendors WHERE id = $1', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ success: false, message: 'Vendor not found' });
  const { rows: pos } = await db.query(
    `SELECT id, po_number, status, total, created_at FROM purchase_orders
     WHERE vendor_id = $1 ORDER BY created_at DESC LIMIT 20`,
    [req.params.id]
  );
  res.json({ success: true, data: { ...rows[0], purchase_orders: pos } });
};

const create = async (req, res) => {
  const {
    name, contact_person, phone, email, address, category,
    gstin, pan, bank_account_holder, bank_account_number, bank_ifsc, bank_name
  } = req.body;

  const categoryName = await validateCategory(category);
  if (categoryName === '__INVALID__') {
    return res.status(422).json({ success: false, message: 'Please select a valid vendor category' });
  }

  const { rows } = await db.query(
    `INSERT INTO vendors
       (name, contact_person, phone, email, address, category,
        gstin, pan, bank_account_holder, bank_account_number, bank_ifsc, bank_name, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
    [name, contact_person, phone, email, address, categoryName,
     gstin, pan, bank_account_holder, bank_account_number, bank_ifsc, bank_name, req.user.id]
  );
  res.status(201).json({ success: true, data: rows[0] });
};

const update = async (req, res) => {
  const payload = { ...req.body };
  if (payload.category !== undefined) {
    const categoryName = await validateCategory(payload.category);
    if (categoryName === '__INVALID__') {
      return res.status(422).json({ success: false, message: 'Please select a valid vendor category' });
    }
    payload.category = categoryName;
  }

  const fields = [
    'name', 'contact_person', 'phone', 'email', 'address', 'category',
    'gstin', 'pan', 'bank_account_holder', 'bank_account_number', 'bank_ifsc', 'bank_name'
  ];
  const updates = []; const values = []; let idx = 1;
  for (const f of fields) {
    if (payload[f] !== undefined) { updates.push(`${f} = $${idx++}`); values.push(payload[f]); }
  }

  if (!updates.length) return res.status(400).json({ success: false, message: 'No fields to update' });
  values.push(req.params.id);
  const { rows } = await db.query(
    `UPDATE vendors SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`, values
  );
  res.json({ success: true, data: rows[0] });
};

const toggleActive = async (req, res) => {
  const { rows } = await db.query(
    'UPDATE vendors SET is_active = NOT is_active WHERE id = $1 RETURNING id, name, is_active',
    [req.params.id]
  );
  res.json({ success: true, data: rows[0] });
};

const hardDelete = async (req, res) => {
  // Check for linked POs first
  const { rows: linked } = await db.query(
    'SELECT COUNT(*) FROM purchase_orders WHERE vendor_id = $1', [req.params.id]
  );
  if (parseInt(linked[0].count) > 0) {
    return res.status(400).json({
      success: false,
      message: `Cannot delete: this vendor has ${linked[0].count} linked purchase order(s). Deactivate instead.`
    });
  }
  const { rows } = await db.query(
    'DELETE FROM vendors WHERE id = $1 RETURNING id, name', [req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ success: false, message: 'Vendor not found' });
  res.json({ success: true, message: `Vendor "${rows[0].name}" permanently deleted` });
};

const bulkImport = async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
  const wb = XLSX.readFile(req.file.path);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
  const results = { created: 0, skipped: 0, errors: [] };
  for (const row of rows) {
    const name = String(row['name'] || row['Name'] || '').trim();
    if (!name) { results.skipped++; continue; }
    const get = (k) => String(row[k] || row[k.charAt(0).toUpperCase() + k.slice(1)] || '').trim();
    const category = get('category');

    if (category) {
      await ensureVendorCategories();
      const { rows: existingCategory } = await db.query(
        'SELECT id FROM vendor_categories WHERE name = $1',
        [category]
      );
      if (!existingCategory[0]) {
        if (req.user.role !== 'admin') {
          results.errors.push({ row: name, error: `Category "${category}" does not exist. Ask admin to add it first.` });
          results.skipped++;
          continue;
        }
        await db.query(
          `INSERT INTO vendor_categories (name, created_by)
           VALUES ($1, $2)
           ON CONFLICT (name) DO NOTHING`,
          [category, req.user.id]
        );
      }
    }

    try {
      await db.query(
        `INSERT INTO vendors
           (name, contact_person, phone, email, address, category,
            gstin, pan, bank_account_holder, bank_account_number, bank_ifsc, bank_name, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) ON CONFLICT DO NOTHING`,
        [name, get('contact_person'), get('phone'), get('email'), get('address'), category,
         get('gstin'), get('pan'), get('bank_account_holder'), get('bank_account_number'),
         get('bank_ifsc'), get('bank_name'), req.user.id]
      );
      results.created++;
    } catch (err) {
      results.errors.push({ row: name, error: err.message });
      results.skipped++;
    }
  }
  res.json({ success: true, data: results });
};

const downloadTemplate = (req, res) => {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    ['name', 'contact_person', 'phone', 'email', 'address', 'category',
     'gstin', 'pan', 'bank_account_holder', 'bank_account_number', 'bank_ifsc', 'bank_name'],
    ['Shree Enterprises', 'Ramesh Shah', '9876543210', 'ramesh@vendor.com',
     'Mumbai, Maharashtra', 'Carpentry', '27XXXXX', 'ABCDE1234F',
     'Ramesh Shah', '123456789012', 'HDFC0001234', 'HDFC Bank'],
  ]);
  ws['!cols'] = Array(12).fill({ wch: 22 });
  XLSX.utils.book_append_sheet(wb, ws, 'Vendors');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Disposition', 'attachment; filename="vendors_import_template.xlsx"');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buf);
};

const exportExcel = async (req, res) => {
  const { rows } = await db.query('SELECT * FROM vendors ORDER BY name ASC');
  const wb = XLSX.utils.book_new();

  const data = rows.map(r => ({
    ...r,
    created_at: r.created_at ? new Date(r.created_at).toISOString() : '',
    updated_at: r.updated_at ? new Date(r.updated_at).toISOString() : '',
  }));
  const ws = XLSX.utils.json_to_sheet(data.length ? data : [{ message: 'No vendor data found' }]);

  XLSX.utils.book_append_sheet(wb, ws, 'Vendors');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const stamp = new Date().toISOString().slice(0, 10);

  res.setHeader('Content-Disposition', `attachment; filename="vendors_export_${stamp}.xlsx"`);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buf);
};

module.exports = {
  list, getOne, create, update, toggleActive, hardDelete,
  bulkImport, downloadTemplate, exportExcel,
  listCategories, createCategory
};
