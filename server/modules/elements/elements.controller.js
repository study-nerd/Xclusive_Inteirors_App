const db = require('../../config/db');
const XLSX = require('xlsx');

const list = async (req, res) => {
  const { active, category_id, search } = req.query;
  let q = `SELECT e.*, c.name AS category_name
           FROM elements e
           LEFT JOIN categories c ON c.id = e.category_id
           WHERE 1=1`;
  const params = [];
  let idx = 1;

  if (active === 'true') { q += ` AND e.is_active = true`; }
  if (category_id)       { q += ` AND e.category_id = $${idx++}`; params.push(category_id); }
  if (search)            { q += ` AND (e.name ILIKE $${idx++} OR e.description ILIKE $${idx})`; params.push(`%${search}%`); params.push(`%${search}%`); idx++; }

  q += ' ORDER BY e.name ASC';
  const { rows } = await db.query(q, params);
  res.json({ success: true, data: rows });
};

const getOne = async (req, res) => {
  const { rows } = await db.query(
    `SELECT e.*, c.name AS category_name FROM elements e
     LEFT JOIN categories c ON c.id = e.category_id WHERE e.id = $1`,
    [req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ success: false, message: 'Element not found' });
  res.json({ success: true, data: rows[0] });
};

const create = async (req, res) => {
  const { name, description, category_id, default_unit, gst_percent, brand_make } = req.body;
  if (!name) return res.status(422).json({ success: false, message: 'Name required' });
  const { rows } = await db.query(
    `INSERT INTO elements (name, description, category_id, default_unit, gst_percent, brand_make, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [name, description, category_id, default_unit, gst_percent || 0, brand_make, req.user.id]
  );
  res.status(201).json({ success: true, data: rows[0] });
};

const update = async (req, res) => {
  const { name, description, category_id, default_unit, gst_percent, brand_make } = req.body;
  const { rows } = await db.query(
    `UPDATE elements SET
       name         = COALESCE($1, name),
       description  = COALESCE($2, description),
       category_id  = COALESCE($3, category_id),
       default_unit = COALESCE($4, default_unit),
       gst_percent  = COALESCE($5, gst_percent),
       brand_make   = COALESCE($6, brand_make)
     WHERE id = $7 RETURNING *`,
    [name, description, category_id, default_unit, gst_percent, brand_make, req.params.id]
  );
  res.json({ success: true, data: rows[0] });
};

const toggleActive = async (req, res) => {
  const { rows } = await db.query(
    'UPDATE elements SET is_active = NOT is_active WHERE id = $1 RETURNING id, name, is_active',
    [req.params.id]
  );
  res.json({ success: true, data: rows[0] });
};

const importExcel = async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });

  const wb = XLSX.readFile(req.file.path);
  const results = { created: 0, skipped: 0, errors: [] };

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });

    for (const row of rows) {
      const name = (row['Name'] || row['name'] || '').toString().trim();
      if (!name) continue;

      const categoryName = (row['Category'] || row['category'] || sheetName).toString().trim();
      const description  = (row['Description'] || row['Discription'] || '').toString().trim();
      const brandMake    = (row['Brand / Make'] || row['Brand'] || '').toString().trim();
      const unit         = (row['UOM'] || row['Unit'] || row['unit'] || '').toString().trim();
      const gst          = parseFloat(row['GST %'] || row['gst'] || 0) || 0;

      try {
        // Upsert category
        await db.query(
          'INSERT INTO categories (name, created_by) VALUES ($1, $2) ON CONFLICT (name) DO NOTHING',
          [categoryName, req.user.id]
        );
        const { rows: catRows } = await db.query(
          'SELECT id FROM categories WHERE name = $1', [categoryName]
        );
        const categoryId = catRows[0]?.id;

        await db.query(
          `INSERT INTO elements (name, description, category_id, default_unit, gst_percent, brand_make, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7)
           ON CONFLICT DO NOTHING`,
          [name, description, categoryId, unit, gst, brandMake, req.user.id]
        );
        results.created++;
      } catch (err) {
        results.errors.push({ name, error: err.message });
        results.skipped++;
      }
    }
  }

  res.json({ success: true, data: results });
};

const exportExcel = async (req, res) => {
  const { rows } = await db.query(
    `SELECT e.*, c.name AS category_name
     FROM elements e
     LEFT JOIN categories c ON c.id = e.category_id
     ORDER BY e.name ASC`
  );

  const wb = XLSX.utils.book_new();
  const data = rows.map(r => ({
    ...r,
    created_at: r.created_at ? new Date(r.created_at).toISOString() : '',
    updated_at: r.updated_at ? new Date(r.updated_at).toISOString() : '',
  }));
  const ws = XLSX.utils.json_to_sheet(data.length ? data : [{ message: 'No element data found' }]);

  XLSX.utils.book_append_sheet(wb, ws, 'Elements');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const stamp = new Date().toISOString().slice(0, 10);

  res.setHeader('Content-Disposition', `attachment; filename="elements_export_${stamp}.xlsx"`);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buf);
};

module.exports = { list, getOne, create, update, toggleActive, importExcel, exportExcel };
