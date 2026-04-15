const bcrypt = require('bcryptjs');
const XLSX   = require('xlsx');
const fs     = require('fs');
const db     = require('../../config/db');

const list = async (req, res) => {
  const { rows } = await db.query(
    `SELECT id, name, email, role, is_active, created_at,
            password_changed_by_user, password_changed_at
     FROM users ORDER BY created_at DESC`
  );
  res.json({ success: true, data: rows });
};

const getMe = async (req, res) => {
  const { rows } = await db.query(
    `SELECT id, name, email, role, is_active,
            password_changed_by_user, password_changed_at
     FROM users WHERE id = $1`,
    [req.user.id]
  );
  if (!rows[0]) return res.status(404).json({ success: false, message: 'User not found' });
  res.json({ success: true, data: rows[0] });
};

const getOne = async (req, res) => {
  const { rows } = await db.query(
    `SELECT id, name, email, role, is_active, created_at,
            password_changed_by_user, password_changed_at
     FROM users WHERE id = $1`,
    [req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ success: false, message: 'User not found' });
  res.json({ success: true, data: rows[0] });
};

const create = async (req, res) => {
  const { name, email, password, role } = req.body;
  const hash = await bcrypt.hash(password, 10);
  const { rows } = await db.query(
    `INSERT INTO users (name, email, password_hash, role)
     VALUES ($1,$2,$3,$4)
     RETURNING id, name, email, role, is_active, created_at`,
    [name, email.toLowerCase(), hash, role]
  );
  res.status(201).json({ success: true, data: rows[0] });
};

const update = async (req, res) => {
  const { name, email, role } = req.body;
  const { rows } = await db.query(
    `UPDATE users SET
       name  = COALESCE($1, name),
       email = COALESCE($2, email),
       role  = COALESCE($3, role)
     WHERE id = $4
     RETURNING id, name, email, role, is_active`,
    [name, email ? email.toLowerCase() : null, role, req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ success: false, message: 'User not found' });
  res.json({ success: true, data: rows[0] });
};

// Admin resets any user's password — no limit
const resetPassword = async (req, res) => {
  const { password } = req.body;
  const hash = await bcrypt.hash(password, 10);
  const { rows } = await db.query(
    'UPDATE users SET password_hash=$1 WHERE id=$2 RETURNING id, name, email',
    [hash, req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ success: false, message: 'User not found' });
  res.json({ success: true, message: 'Password reset successfully' });
};

// Non-admin self-service change — one time only
const changeOwnPassword = async (req, res) => {
  const { current_password, new_password } = req.body;

  const { rows } = await db.query(
    'SELECT * FROM users WHERE id=$1', [req.user.id]
  );
  const user = rows[0];
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });

  // Admins use resetPassword route — block here just in case
  if (user.role === 'admin') {
    return res.status(403).json({ success: false, message: 'Admins cannot use this endpoint' });
  }

  // One-time limit check
  if (user.password_changed_by_user) {
    return res.status(403).json({
      success: false,
      message: 'You have already changed your password once. Contact an admin to reset it.',
    });
  }

  // Verify current password
  const valid = await bcrypt.compare(current_password, user.password_hash);
  if (!valid) {
    return res.status(401).json({ success: false, message: 'Current password is incorrect' });
  }

  const hash = await bcrypt.hash(new_password, 10);
  await db.query(
    `UPDATE users SET
       password_hash = $1,
       password_changed_by_user = true,
       password_changed_at = NOW()
     WHERE id = $2`,
    [hash, req.user.id]
  );

  res.json({ success: true, message: 'Password changed successfully' });
};

const toggleActive = async (req, res) => {
  const { rows } = await db.query(
    'UPDATE users SET is_active = NOT is_active WHERE id=$1 RETURNING id, name, is_active',
    [req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ success: false, message: 'User not found' });
  res.json({ success: true, data: rows[0] });
};

const hardDelete = async (req, res) => {
  if (req.params.id === req.user.id) {
    return res.status(400).json({ success: false, message: 'Cannot delete your own account' });
  }
  const { rows } = await db.query(
    'DELETE FROM users WHERE id=$1 RETURNING id, name', [req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ success: false, message: 'User not found' });
  res.json({ success: true, message: `User "${rows[0].name}" permanently deleted` });
};

const bulkImport = async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
  const tmpPath = req.file.path;
  const results = { created: 0, skipped: 0, errors: [] };
  try {
    const wb = XLSX.readFile(tmpPath);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });

    for (const row of rows) {
      const name     = String(row['name']     || row['Name']     || '').trim();
      const email    = String(row['email']    || row['Email']    || '').trim().toLowerCase();
      const password = String(row['password'] || row['Password'] || '').trim();
      const role     = String(row['role']     || row['Role']     || 'employee').trim().toLowerCase();

      if (!name || !email || !password) {
        results.errors.push({ row: name || email, error: 'name, email and password required' });
        results.skipped++; continue;
      }
      if (!['admin','manager','employee'].includes(role)) {
        results.errors.push({ row: email, error: `Invalid role "${role}"` });
        results.skipped++; continue;
      }
      try {
        const hash = await bcrypt.hash(password, 10);
        const result = await db.query(
          `INSERT INTO users (name, email, password_hash, role)
           VALUES ($1,$2,$3,$4) ON CONFLICT (email) DO NOTHING`,
          [name, email, hash, role]
        );
        result.rowCount > 0 ? results.created++ : results.skipped++;
      } catch (err) {
        results.errors.push({ row: email, error: err.message });
        results.skipped++;
      }
    }
  } finally {
    try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
  }
  res.json({ success: true, data: results });
};

const downloadTemplate = (req, res) => {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    ['name','email','password','role'],
    ['John Doe','john@xclusiveinteriors.in','Pass@123','employee'],
    ['Jane Manager','jane@xclusiveinteriors.in','Pass@123','manager'],
  ]);
  ws['!cols'] = [{ wch:20 },{ wch:30 },{ wch:15 },{ wch:12 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Users');
  const buf = XLSX.write(wb, { type:'buffer', bookType:'xlsx' });
  res.setHeader('Content-Disposition','attachment; filename="users_import_template.xlsx"');
  res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buf);
};

module.exports = {
  list, getMe, getOne, create, update,
  resetPassword, changeOwnPassword,
  toggleActive, hardDelete, bulkImport, downloadTemplate,
};
