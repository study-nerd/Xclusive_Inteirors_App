const XLSX = require('xlsx');
const db = require('../../config/db');

const list = async (req, res) => {
  const { status } = req.query;
  let q = `SELECT p.*,
             (SELECT COUNT(*) FROM purchase_orders WHERE project_id = p.id) AS po_count,
             (SELECT COUNT(*) FROM dprs WHERE project_id = p.id) AS dpr_count
           FROM projects p WHERE 1=1`;
  const params = [];
  if (status) { q += ` AND p.status = $1`; params.push(status); }
  q += ' ORDER BY p.created_at DESC';
  const { rows } = await db.query(q, params);
  res.json({ success: true, data: rows });
};

const getOne = async (req, res) => {
  const { rows } = await db.query('SELECT * FROM projects WHERE id = $1', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ success: false, message: 'Project not found' });

  const [team, contractors, pos, dprs, checklists, snags] = await Promise.all([
    db.query(`SELECT u.id, u.name, u.role FROM project_team pt JOIN users u ON u.id = pt.user_id WHERE pt.project_id = $1`, [req.params.id]),
    db.query(`SELECT * FROM project_contractors WHERE project_id = $1`, [req.params.id]),
    db.query(`SELECT id, po_number, status, total, created_at, vendor_id FROM purchase_orders WHERE project_id = $1 ORDER BY created_at DESC`, [req.params.id]),
    db.query(`SELECT id, report_date, status, submitted_by FROM dprs WHERE project_id = $1 ORDER BY report_date DESC LIMIT 10`, [req.params.id]),
    db.query(`SELECT pc.*, ct.name AS template_name FROM project_checklists pc LEFT JOIN checklist_templates ct ON ct.id = pc.template_id WHERE pc.project_id = $1`, [req.params.id]),
    db.query(`SELECT id, area, item_name, status, created_at FROM snags WHERE project_id = $1 ORDER BY created_at DESC`, [req.params.id]),
  ]);

  res.json({ success: true, data: { ...rows[0], team: team.rows, contractors: contractors.rows, purchase_orders: pos.rows, dprs: dprs.rows, checklists: checklists.rows, snags: snags.rows } });
};

const create = async (req, res) => {
  const { name, code, client_name, site_address, location, status, project_type, services_taken, team_lead_3d, team_lead_2d, remarks, project_scope, start_date, end_date } = req.body;
  const { rows } = await db.query(
    `INSERT INTO projects (name, code, client_name, site_address, location, status, project_type, services_taken, team_lead_3d, team_lead_2d, remarks, project_scope, start_date, end_date, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
    [name, code, client_name, site_address, location, status || 'active', project_type, services_taken, team_lead_3d, team_lead_2d, remarks, project_scope, start_date, end_date, req.user.id]
  );
  res.status(201).json({ success: true, data: rows[0] });
};

const update = async (req, res) => {
  const fields = ['name','client_name','site_address','location','status','project_type','services_taken','team_lead_3d','team_lead_2d','remarks','project_scope','start_date','end_date'];
  const updates = []; const values = []; let idx = 1;
  for (const f of fields) {
    if (req.body[f] !== undefined) { updates.push(`${f} = $${idx++}`); values.push(req.body[f]); }
  }
  if (!updates.length) return res.status(400).json({ success: false, message: 'Nothing to update' });
  values.push(req.params.id);
  const { rows } = await db.query(`UPDATE projects SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`, values);
  res.json({ success: true, data: rows[0] });
};

const updateStatus = async (req, res) => {
  const { status } = req.body;
  const { rows } = await db.query('UPDATE projects SET status = $1 WHERE id = $2 RETURNING id, name, status', [status, req.params.id]);
  res.json({ success: true, data: rows[0] });
};

const hardDelete = async (req, res) => {
  // Block if there are linked POs
  const { rows: linked } = await db.query('SELECT COUNT(*) FROM purchase_orders WHERE project_id = $1', [req.params.id]);
  if (parseInt(linked[0].count) > 0) {
    return res.status(400).json({
      success: false,
      message: `Cannot delete: this project has ${linked[0].count} purchase order(s). Delete POs first.`
    });
  }
  const { rows } = await db.query('DELETE FROM projects WHERE id = $1 RETURNING id, name', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ success: false, message: 'Project not found' });
  res.json({ success: true, message: `Project "${rows[0].name}" permanently deleted` });
};

const addTeamMember = async (req, res) => {
  await db.query('INSERT INTO project_team (project_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [req.params.id, req.body.user_id]);
  res.json({ success: true });
};
const removeTeamMember = async (req, res) => {
  await db.query('DELETE FROM project_team WHERE project_id = $1 AND user_id = $2', [req.params.id, req.params.userId]);
  res.json({ success: true });
};
const upsertContractor = async (req, res) => {
  const { trade, contractor_name, vendor_id, notes } = req.body;
  const { rows } = await db.query(
    `INSERT INTO project_contractors (project_id, trade, contractor_name, vendor_id, notes)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (project_id, trade) DO UPDATE SET contractor_name=EXCLUDED.contractor_name, vendor_id=EXCLUDED.vendor_id, notes=EXCLUDED.notes
     RETURNING *`,
    [req.params.id, trade, contractor_name, vendor_id || null, notes]
  );
  res.json({ success: true, data: rows[0] });
};
const removeContractor = async (req, res) => {
  await db.query('DELETE FROM project_contractors WHERE id = $1', [req.params.cid]);
  res.json({ success: true });
};
const getSchedule = async (req, res) => {
  const { rows } = await db.query('SELECT * FROM project_activity_schedule WHERE project_id = $1 ORDER BY sort_order ASC', [req.params.id]);
  res.json({ success: true, data: rows });
};
const updateScheduleItem = async (req, res) => {
  const { actual_start_date, actual_end_date, status, notes } = req.body;
  const completed_by = status === 'completed' ? req.user.id : null;
  const { rows } = await db.query(
    `UPDATE project_activity_schedule SET actual_start_date=COALESCE($1,actual_start_date), actual_end_date=COALESCE($2,actual_end_date), status=COALESCE($3,status), notes=COALESCE($4,notes), completed_by=COALESCE($5,completed_by) WHERE id=$6 AND project_id=$7 RETURNING *`,
    [actual_start_date, actual_end_date, status, notes, completed_by, req.params.sid, req.params.id]
  );
  res.json({ success: true, data: rows[0] });
};
const generateSchedule = async (req, res) => {
  const { project_type } = req.body;
  const { rows: templates } = await db.query('SELECT * FROM activity_schedule_templates WHERE project_type=$1 AND is_active=true ORDER BY step_number ASC', [project_type]);
  if (!templates.length) return res.status(404).json({ success: false, message: 'No template found' });
  await db.query('DELETE FROM project_activity_schedule WHERE project_id=$1', [req.params.id]);
  const values = templates.map((t, i) =>
    `('${req.params.id}','${t.id}','${t.activity_no}','${t.milestone_name.replace(/'/g,"''")}','${t.phase}',${t.step_number},${t.duration_days},'${t.dependency_condition}',${i})`
  ).join(',');
  await db.query(`INSERT INTO project_activity_schedule (project_id,template_id,activity_no,milestone_name,phase,step_number,duration_days,dependency_condition,sort_order) VALUES ${values}`);
  const { rows } = await db.query('SELECT * FROM project_activity_schedule WHERE project_id=$1 ORDER BY sort_order ASC', [req.params.id]);
  res.json({ success: true, data: rows });
};
const bulkImport = async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
  const wb = XLSX.readFile(req.file.path);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
  const results = { created: 0, skipped: 0, errors: [] };
  const get = (row, k) => String(row[k] || row[k.charAt(0).toUpperCase() + k.slice(1)] || '').trim();
  for (const row of rows) {
    const name = get(row, 'name'); const code = get(row, 'code');
    if (!name || !code) { results.errors.push({ row: name || code || '?', error: 'name and code required' }); results.skipped++; continue; }
    try {
      await db.query(
        `INSERT INTO projects (name,code,client_name,site_address,location,status,project_type,services_taken,team_lead_3d,team_lead_2d,start_date,end_date,created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) ON CONFLICT (code) DO NOTHING`,
        [name,code,get(row,'client_name'),get(row,'site_address'),get(row,'location'),get(row,'status')||'active',get(row,'project_type'),get(row,'services_taken'),get(row,'team_lead_3d'),get(row,'team_lead_2d'),get(row,'start_date')||null,get(row,'end_date')||null,req.user.id]
      );
      results.created++;
    } catch (err) { results.errors.push({ row: name, error: err.message }); results.skipped++; }
  }
  res.json({ success: true, data: results });
};
const downloadTemplate = (req, res) => {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    ['name','code','client_name','site_address','location','project_type','services_taken','team_lead_3d','team_lead_2d','start_date','end_date','status'],
    ['Kasat Residence','RDASH30138','Shraddha Kasat','Vantage 21, Pimple Saudagar','Pune','3BHK','Turnkey','Saylee','Shrutika','2026-01-01','2026-06-30','active'],
  ]);
  ws['!cols'] = Array(12).fill({ wch: 22 });
  XLSX.utils.book_append_sheet(wb, ws, 'Projects');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Disposition', 'attachment; filename="projects_import_template.xlsx"');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buf);
};

module.exports = { list, getOne, create, update, updateStatus, hardDelete, addTeamMember, removeTeamMember, upsertContractor, removeContractor, getSchedule, updateScheduleItem, generateSchedule, bulkImport, downloadTemplate };
