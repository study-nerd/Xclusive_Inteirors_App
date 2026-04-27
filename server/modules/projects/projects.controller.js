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

// ── Project-type normalizer for template lookup ───────────────
const TEMPLATE_FALLBACK_MAP = {
  '3bhk_bungalow': '3BHK', '3bhkbungalow': '3BHK',
  '4bhk_bungalow': '4BHK', '4bhkbungalow': '4BHK',
  '5bhk_bungalow': '5BHK', '5bhkbungalow': '5BHK',
  '6bhk_bungalow': '6BHK', '6bhkbungalow': '6BHK',
  '6bhk_plus_bungalow': '6BHK', '6bhkplusbungalow': '6BHK',
  'commercial': '4BHK', 'villa': '4BHK', '1bhk': '2BHK',
};

const resolveProjectType = async (queryFn, rawType) => {
  if (!rawType) return null;
  // Exact match
  const { rows: e1 } = await queryFn(
    `SELECT DISTINCT project_type FROM activity_schedule_templates WHERE project_type = $1 AND is_active = true LIMIT 1`,
    [rawType]
  );
  if (e1.length) return rawType;
  // Case-insensitive + space-normalised match
  const normalised = rawType.trim().replace(/\s+/g, '');
  const { rows: e2 } = await queryFn(
    `SELECT DISTINCT project_type FROM activity_schedule_templates WHERE LOWER(REPLACE(project_type,' ','')) = LOWER($1) AND is_active = true LIMIT 1`,
    [normalised]
  );
  if (e2.length) return e2[0].project_type;
  // Fallback map
  const key = rawType.trim().toLowerCase().replace(/\s+/g, '_');
  const mapped = TEMPLATE_FALLBACK_MAP[key] || TEMPLATE_FALLBACK_MAP[key.replace(/_/g, '')];
  if (mapped) {
    const { rows: e3 } = await queryFn(
      `SELECT DISTINCT project_type FROM activity_schedule_templates WHERE project_type = $1 AND is_active = true LIMIT 1`,
      [mapped]
    );
    if (e3.length) return mapped;
  }
  return null;
};

// ── Audit helper ─────────────────────────────────────────────
const logAudit = async (client, { userId, userName, action, entityType, entityId, oldData, newData, notes }) => {
  try {
    await client.query(
      `INSERT INTO audit_logs (user_id, user_name, action, entity_type, entity_id, old_data, new_data, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [userId, userName, action, entityType, entityId,
       oldData ? JSON.stringify(oldData) : null,
       newData ? JSON.stringify(newData) : null,
       notes || null]
    );
  } catch (e) {
    console.error('Audit log failed (non-fatal):', e.message);
  }
};

// ── Phase → Kanban column mapping (follows master phase order) ──
// ── NEW Phase/Column mappings (replaces old ones at line 213) ──────────────

// Phases from new universal sheet → Kanban column mapping
const PHASE_TO_COLUMN = {
  'FURNITURE LAYOUT':   'Furniture Layout',
  'Furniture Layout':   'Furniture Layout',
  '3D DESIGN':          '3D Design',
  '3D Design':          '3D Design',
  '2D DRAWINGS':        '2D Drawings',
  '2D Drawings':        '2D Drawings',
  'MASTER BEDROOM':     '2D Detailed Drawing',
  "PARENT'S BEDROOM":   '2D Detailed Drawing',
  "PARENT'S BEDROOM ":  '2D Detailed Drawing',
  "KID'S BEDROOM":      '2D Detailed Drawing',
  'GUEST BEDROOM':      '2D Detailed Drawing',
  'OFFICE ROOM':        '2D Detailed Drawing',
  "SERVANT'S ROOM":     '2D Detailed Drawing',
  'SERVICES':           '2D Detailed Drawing',
  '2D Detailed Drawing':'2D Detailed Drawing',
  'SELECTION':          'Selection',
  'Selection':          'Selection',
  'CUSTOMIZATION':      'Customization',
  'Customization':      'Customization',
  'EXECUTION':          'Execution',
  'Execution':          'Execution',
  'Execution - Civil':  'Execution',
  'Handover':           'Completed',
  'HANDOVER':           'Completed',
};

const PHASE_SEQUENCE = [
  'Furniture Layout', 'FURNITURE LAYOUT',
  '3D Design', '3D DESIGN',
  '2D Drawings', '2D DRAWINGS',
  '2D Detailed Drawing',
  'MASTER BEDROOM', "PARENT'S BEDROOM", "PARENT'S BEDROOM ", "KID'S BEDROOM",
  'GUEST BEDROOM', 'OFFICE ROOM', "SERVANT'S ROOM", 'SERVICES',
  'Selection', 'SELECTION',
  'Customization', 'CUSTOMIZATION',
  'Execution', 'EXECUTION', 'Execution - Civil',
  'Handover', 'HANDOVER',
];

// Ordered Kanban columns
const KANBAN_COLUMNS = [
  'Not Started', 'Furniture Layout', '3D Design', '2D Drawings',
  '2D Detailed Drawing', 'Selection', 'Customization', 'Execution', 'Completed',
];

// Map kanban column → phases it covers (for advance/backward drag)
const COLUMN_TO_PHASES = {
  'Not Started':         [],
  'Furniture Layout':    ['Furniture Layout', 'FURNITURE LAYOUT'],
  '3D Design':           ['3D Design', '3D DESIGN'],
  '2D Drawings':         ['2D Drawings', '2D DRAWINGS'],
  '2D Detailed Drawing': ['2D Detailed Drawing', 'MASTER BEDROOM', "PARENT'S BEDROOM", "PARENT'S BEDROOM ", "KID'S BEDROOM", 'GUEST BEDROOM', 'OFFICE ROOM', "SERVANT'S ROOM", 'SERVICES'],
  'Selection':           ['Selection', 'SELECTION'],
  'Customization':       ['Customization', 'CUSTOMIZATION'],
  'Execution':           ['Execution', 'EXECUTION', 'Execution - Civil'],
  'Completed':           [],
};

// ── Date scaling helpers ───────────────────────────────────────────────────
/**
 * Scale stage duration_days proportionally so total sums to targetDays.
 * Decimals accumulate within phase and are rounded at phase boundary.
 * @param {Array} stages - array of { phase_group, duration_days }
 * @param {number} targetDays
 * @returns {Array} stages with scaled duration_days (integers)
 */
const scaleStagesByTargetDays = (stages, targetDays) => {
  const totalTemplateDays = stages.reduce((sum, s) => sum + (parseFloat(s.duration_days) || 0), 0);
  if (!totalTemplateDays || !targetDays) return stages;
  const factor = targetDays / totalTemplateDays;

  // Group by phase to accumulate decimals and round at boundary
  const phaseGroups = [];
  const phaseMap = {};
  for (const s of stages) {
    const key = s.phase_group || s.phase || '__none__';
    if (!phaseMap[key]) { phaseMap[key] = []; phaseGroups.push(key); }
    phaseMap[key].push(s);
  }

  const result = [];
  let globalAccumulator = 0;
  let totalAssigned = 0;
  const totalStages = stages.length;
  let stageIdx = 0;

  for (const phase of phaseGroups) {
    const phaseStages = phaseMap[phase];
    let phaseAccumulator = 0;
    for (let i = 0; i < phaseStages.length; i++) {
      stageIdx++;
      const rawDays = (parseFloat(phaseStages[i].duration_days) || 0) * factor;
      phaseAccumulator += rawDays;
      const isLastInPhase = i === phaseStages.length - 1;
      const isGlobalLast = stageIdx === totalStages;
      let assignedDays;
      if (isGlobalLast) {
        // Last stage globally: assign whatever is left to hit target exactly
        assignedDays = Math.max(0, Math.round(targetDays - totalAssigned));
      } else if (isLastInPhase) {
        assignedDays = Math.max(0, Math.round(phaseAccumulator));
        phaseAccumulator = 0;
      } else {
        assignedDays = Math.max(0, Math.floor(phaseAccumulator));
        phaseAccumulator -= assignedDays;
      }
      totalAssigned += assignedDays;
      result.push({ ...phaseStages[i], duration_days: assignedDays });
    }
  }
  return result;
};

/**
 * Calculate planned_start_date and planned_end_date for each stage sequentially.
 * @param {Array} stages
 * @param {string|Date} projectStartDate
 * @returns {Array} stages with planned_start_date, planned_end_date set
 */
const assignStageDates = (stages, projectStartDate) => {
  if (!projectStartDate) return stages;
  let cursor = new Date(projectStartDate);
  cursor.setHours(0, 0, 0, 0);
  return stages.map(s => {
    const days = parseInt(s.duration_days) || 0;
    const start = new Date(cursor);
    // 0-day stages: same start and end date, cursor doesn't advance
    if (days === 0) {
      return {
        ...s,
        planned_start_date: start.toISOString().split('T')[0],
        planned_end_date:   start.toISOString().split('T')[0],
      };
    }
    const end = new Date(cursor);
    end.setDate(end.getDate() + days - 1);
    cursor = new Date(end);
    cursor.setDate(cursor.getDate() + 1);
    return {
      ...s,
      planned_start_date: start.toISOString().split('T')[0],
      planned_end_date:   end.toISOString().split('T')[0],
    };
  });
};

const getProjectKanbanColumn = (project, schedule) => {
  if (project.status === 'completed') return 'Completed';
  if (!schedule || schedule.length === 0) return 'Not Started';

  const total = schedule.length;
  const completedList = schedule.filter(s => s.status === 'completed');
  if (total > 0 && completedList.length === total) return 'Completed';

  const inProgressStages = schedule.filter(s => s.status === 'in_progress');
  if (inProgressStages.length > 0) {
    const maxSortStage = inProgressStages.reduce((a, b) => (a.sort_order > b.sort_order ? a : b));
    return PHASE_TO_COLUMN[maxSortStage.phase] || 'Execution';
  }

  for (const phase of PHASE_SEQUENCE) {
    const phaseStages = schedule.filter(s => s.phase === phase);
    if (phaseStages.length > 0 && phaseStages.some(s => s.status !== 'completed')) {
      return PHASE_TO_COLUMN[phase] || phase;
    }
  }

  if (completedList.length > 0) {
    const maxSortStage = completedList.reduce((a, b) => (a.sort_order > b.sort_order ? a : b));
    return PHASE_TO_COLUMN[maxSortStage.phase] || 'Execution';
  }

  return 'Not Started';
};

const getTrackerData = async (req, res) => {
  const { status, location, project_type, services_taken, team_member } = req.query;

  let q = `SELECT p.*,
    (SELECT COUNT(*) FROM purchase_orders WHERE project_id = p.id) AS po_count,
    (SELECT COUNT(*) FROM dprs         WHERE project_id = p.id) AS dpr_count,
    (SELECT COUNT(*) FROM snags WHERE project_id = p.id AND status != 'resolved') AS open_snag_count,
    (SELECT json_agg(json_build_object('id',u.id,'name',u.name,'role',u.role))
       FROM project_team pt JOIN users u ON u.id = pt.user_id
       WHERE pt.project_id = p.id) AS team_members
  FROM projects p WHERE 1=1`;

  const params = [];
  let idx = 1;

  if (status) { q += ` AND p.status = $${idx++}`; params.push(status); }
  if (location) { q += ` AND LOWER(p.location) LIKE $${idx++}`; params.push(`%${location.toLowerCase()}%`); }
  if (project_type) { q += ` AND p.project_type = $${idx++}`; params.push(project_type); }
  if (services_taken) { q += ` AND p.services_taken = $${idx++}`; params.push(services_taken); }
  if (team_member) {
    q += ` AND EXISTS (SELECT 1 FROM project_team pt WHERE pt.project_id = p.id AND pt.user_id = $${idx++})`;
    params.push(team_member);
  }

  q += ' ORDER BY p.created_at DESC';
  const { rows: projects } = await db.query(q, params);

  // Fetch schedules for all projects in one query
  const projectIds = projects.map(p => p.id);
  let schedulesByProject = {};

  if (projectIds.length > 0) {
    const { rows: schedules } = await db.query(
      `SELECT project_id, phase, status, sort_order, milestone_name,
              weight, planned_start_date, planned_end_date, actual_start_date, actual_end_date
       FROM project_activity_schedule
       WHERE project_id = ANY($1::uuid[])
       ORDER BY project_id, sort_order ASC`,
      [projectIds]
    );
    for (const s of schedules) {
      if (!schedulesByProject[s.project_id]) schedulesByProject[s.project_id] = [];
      schedulesByProject[s.project_id].push(s);
    }
  }

  const enriched = projects.map(p => {
    const schedule = schedulesByProject[p.id] || [];
    const total = schedule.length;
    const completedStages = schedule.filter(s => s.status === 'completed');
    const hasTotalWeight = schedule.some(s => s.weight && parseFloat(s.weight) !== 1);

    let progress = 0;
    if (total > 0) {
      if (hasTotalWeight) {
        const tw = schedule.reduce((sum, s) => sum + parseFloat(s.weight || 1), 0);
        const cw = completedStages.reduce((sum, s) => sum + parseFloat(s.weight || 1), 0);
        progress = tw > 0 ? Math.round((cw / tw) * 100) : 0;
      } else {
        progress = Math.round((completedStages.length / total) * 100);
      }
    }

    const currentPhase = schedule.find(s => s.status === 'in_progress')?.phase
      || completedStages.at(-1)?.phase
      || null;

    const kanban_column = getProjectKanbanColumn(p, schedule);

    return {
      ...p,
      progress,
      current_phase: currentPhase,
      kanban_column,
      total_stages: total,
      completed_stages: completedStages.length,
    };
  });

  // Summary counts
  const totalActive   = enriched.filter(p => p.status === 'active').length;
  const inDesign      = enriched.filter(p => ['3D Design','2D Drawings','2D Detailed Drawing'].includes(p.kanban_column)).length;
  const inExecution   = enriched.filter(p => p.kanban_column === 'Execution').length;
  const nearComplete  = enriched.filter(p => p.status === 'active' && p.kanban_column === 'Completed' && p.progress < 100).length;
  const delayed       = enriched.filter(p => {
    const now = new Date(); now.setHours(0,0,0,0);
    return p.status === 'active';
  }).length; // placeholder — real delay computed per project in tracker page

  res.json({
    success: true,
    data: {
      summary: { totalActive, inDesign, inExecution, nearComplete },
      projects: enriched,
    },
  });
};

// ── Stage CRUD (wraps project_activity_schedule) ──────────
const createStage = async (req, res) => {
  const { title, phase, phase_group, sort_order, weight, planned_start_date, planned_end_date,
          assigned_to, notes, status } = req.body;

  if (!title) return res.status(400).json({ success: false, message: 'title is required' });

  const { rows: existing } = await db.query(
    'SELECT MAX(sort_order) AS max_so FROM project_activity_schedule WHERE project_id=$1',
    [req.params.id]
  );
  const nextSort = sort_order !== undefined ? sort_order : (existing[0]?.max_so ?? 0) + 1;

  const { rows } = await db.query(
    `INSERT INTO project_activity_schedule
       (project_id, milestone_name, phase, phase_group, sort_order, weight,
        planned_start_date, planned_end_date, assigned_to, notes, status, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
    [req.params.id, title, phase || null, phase_group || null, nextSort,
     weight || 1, planned_start_date || null, planned_end_date || null,
     assigned_to || null, notes || null, status || 'pending', req.user.id]
  );

  await logAudit(db, {
    userId: req.user.id, userName: req.user.name,
    action: 'STAGE_CREATED', entityType: 'stage', entityId: rows[0].id,
    newData: rows[0],
  });

  res.status(201).json({ success: true, data: rows[0] });
};

const updateStage = async (req, res) => {
  const { milestone_name, phase, phase_group, sort_order, weight, status,
          planned_start_date, planned_end_date, actual_start_date, actual_end_date,
          assigned_to, notes, attachment_url } = req.body;

  const { rows: before } = await db.query(
    'SELECT * FROM project_activity_schedule WHERE id=$1 AND project_id=$2',
    [req.params.sid, req.params.id]
  );
  if (!before[0]) return res.status(404).json({ success: false, message: 'Stage not found' });

  const wasBlocked = before[0].status === 'blocked';
  const isNowBlocked = status === 'blocked';
  const blockingChanged = isNowBlocked !== wasBlocked;

  const fields = ['milestone_name','phase','phase_group','sort_order','weight','status',
    'planned_start_date','planned_end_date','actual_start_date','actual_end_date',
    'assigned_to','notes','attachment_url','drive_link'];
  const updates = []; const values = []; let idx = 1;

  const body = { milestone_name, phase, phase_group, sort_order, weight, status,
    planned_start_date, planned_end_date, actual_start_date, actual_end_date,
    assigned_to, notes, attachment_url, drive_link: req.body.drive_link };

  // When blocking: zero out duration_days, preserve original in notes-meta
  if (isNowBlocked && !wasBlocked) {
    body.duration_days = 0;
    updates.push(`duration_days = $${idx++}`); values.push(0);
    // Store original duration so it can be restored on unblock
    updates.push(`attachment_url = $${idx++}`);
    values.push(before[0].attachment_url || `__orig_days:${before[0].duration_days}`);
  }

  // When unblocking: restore original duration_days if we stored it
  if (!isNowBlocked && wasBlocked) {
    const stored = before[0].attachment_url || '';
    const match = stored.match(/^__orig_days:(\d+)/);
    const origDays = match ? parseInt(match[1]) : (before[0].duration_days || 1);
    updates.push(`duration_days = $${idx++}`); values.push(origDays);
    // Clear the stored original if it was saved in attachment_url
    if (match) { updates.push(`attachment_url = $${idx++}`); values.push(null); }
  }

  for (const f of fields) {
    if (body[f] !== undefined) { updates.push(`${f} = $${idx++}`); values.push(body[f] ?? null); }
  }

  if (status === 'completed') { updates.push(`completed_by = $${idx++}`); values.push(req.user.id); }
  updates.push(`updated_by = $${idx++}`); values.push(req.user.id);
  updates.push(`updated_at = NOW()`);

  values.push(req.params.sid, req.params.id);
  const { rows } = await db.query(
    `UPDATE project_activity_schedule SET ${updates.join(', ')} WHERE id=$${idx} AND project_id=$${idx+1} RETURNING *`,
    values
  );

  // ── Cascade date recalculation for all stages after this one ────────────
  if (blockingChanged && rows[0]?.planned_start_date) {
    const { rows: allStages } = await db.query(
      `SELECT * FROM project_activity_schedule WHERE project_id=$1 ORDER BY sort_order ASC`,
      [req.params.id]
    );

    const thisIdx = allStages.findIndex(s => s.id === req.params.sid);
    if (thisIdx !== -1 && thisIdx < allStages.length - 1) {
      // Build cursor from this stage's planned_start + its (new) duration
      const thisDays = isNowBlocked ? 0 : (rows[0].duration_days || 0);
      let cursor = new Date(rows[0].planned_start_date);
      cursor.setHours(0, 0, 0, 0);
      if (thisDays > 0) cursor.setDate(cursor.getDate() + thisDays);
      // else cursor stays same day (blocked stage takes 0 days)

      for (let i = thisIdx + 1; i < allStages.length; i++) {
        const s = allStages[i];
        const days = parseInt(s.duration_days) || 0;
        const newStart = new Date(cursor);
        let newEnd;
        if (days === 0) {
          newEnd = new Date(cursor);
        } else {
          newEnd = new Date(cursor);
          newEnd.setDate(newEnd.getDate() + days - 1);
          cursor = new Date(newEnd);
          cursor.setDate(cursor.getDate() + 1);
        }
        await db.query(
          `UPDATE project_activity_schedule
           SET planned_start_date=$1, planned_end_date=$2, updated_at=NOW()
           WHERE id=$3`,
          [newStart.toISOString().split('T')[0], newEnd.toISOString().split('T')[0], s.id]
        );
      }
    }
  }

  await logAudit(db, {
    userId: req.user.id, userName: req.user.name,
    action: 'STAGE_UPDATED', entityType: 'stage', entityId: rows[0]?.id,
    oldData: before[0], newData: rows[0],
  });

  res.json({ success: true, data: rows[0] });
};

const deleteStage = async (req, res) => {
  const { rows } = await db.query(
    'DELETE FROM project_activity_schedule WHERE id=$1 AND project_id=$2 RETURNING *',
    [req.params.sid, req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ success: false, message: 'Stage not found' });

  await logAudit(db, {
    userId: req.user.id, userName: req.user.name,
    action: 'STAGE_DELETED', entityType: 'stage', entityId: req.params.sid,
    oldData: rows[0],
  });

  res.json({ success: true });
};

const getStages = async (req, res) => {
  const { rows: stages } = await db.query(
    `SELECT pas.*,
       u.name AS assigned_to_name,
       cb.name AS created_by_name,
       co.name AS completed_by_name
     FROM project_activity_schedule pas
     LEFT JOIN users u  ON u.id  = pas.assigned_to
     LEFT JOIN users cb ON cb.id = pas.created_by
     LEFT JOIN users co ON co.id = pas.completed_by
     WHERE pas.project_id = $1
     ORDER BY pas.sort_order ASC, pas.created_at ASC`,
    [req.params.id]
  );

  const total = stages.length;
  const completedCount = stages.filter(s => s.status === 'completed' || s.status === 'blocked').length;
  const hasTotalWeight = stages.some(s => s.weight && parseFloat(s.weight) !== 1);

  let progress = 0;
  if (total > 0) {
    if (hasTotalWeight) {
      const tw = stages.reduce((sum, s) => sum + parseFloat(s.weight || 1), 0);
      const cw = stages
        .filter(s => s.status === 'completed' || s.status === 'blocked')
        .reduce((sum, s) => sum + parseFloat(s.weight || 1), 0);
      progress = tw > 0 ? Math.round((cw / tw) * 100) : 0;
    } else {
      progress = Math.round((completedCount / total) * 100);
    }
  }

  res.json({ success: true, data: { stages, progress, total, completed: completedCount } });
}

const applyTemplate = async (req, res) => {
  const { template_source, template_id, clear_existing, project_start_date, target_days } = req.body;

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    if (clear_existing) {
      await client.query('DELETE FROM project_activity_schedule WHERE project_id=$1', [req.params.id]);
    }

    const { rows: existing } = await client.query(
      'SELECT MAX(sort_order) AS max_so FROM project_activity_schedule WHERE project_id=$1',
      [req.params.id]
    );
    let sortOffset = existing[0]?.max_so ?? 0;
    let insertedCount = 0;

    // ── Fetch universal template from stage_templates (name = 'Universal') ──
    const { rows: universalTpl } = await client.query(
      `SELECT id FROM stage_templates WHERE name='Universal' ORDER BY created_at ASC LIMIT 1`
    );

    let rawStages = [];

    if (template_source === 'universal' || (!template_source && universalTpl.length > 0)) {
      // Use universal template
      const tplId = universalTpl[0]?.id;
      if (!tplId) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, message: 'Universal template not found. Please seed it first.' });
      }
      const { rows: items } = await client.query(
        `SELECT * FROM stage_template_items WHERE template_id=$1 ORDER BY sort_order ASC`,
        [tplId]
      );
      rawStages = items.map((item, i) => ({
        milestone_name: item.title,
        phase: item.phase_group || null,
        phase_group: item.phase_group || null,
        duration_days: parseFloat(item.duration_days) || 0,
        weight: parseFloat(item.weight) || 1,
        activity_no: String(i + 1),
        step_number: i + 1,
        template_id: null,
        dependency_condition: '',
      }));
    } else if (template_source === 'custom' && template_id) {
      const { rows: items } = await client.query(
        `SELECT * FROM stage_template_items WHERE template_id=$1 ORDER BY sort_order ASC`,
        [template_id]
      );
      if (!items.length) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, message: 'Template has no items' });
      }
      rawStages = items.map((item, i) => ({
        milestone_name: item.title,
        phase: item.phase_group || null,
        phase_group: item.phase_group || null,
        duration_days: parseFloat(item.duration_days) || 0,
        weight: parseFloat(item.weight) || 1,
        activity_no: String(i + 1),
        step_number: i + 1,
        template_id: null,
        dependency_condition: '',
      }));
    } else {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: 'Invalid template_source or missing template_id' });
    }

    // ── Scale days if target_days provided ───────────────────────────────
    let scaledStages = rawStages;
    if (target_days && parseFloat(target_days) > 0) {
      scaledStages = scaleStagesByTargetDays(rawStages, parseFloat(target_days));
    }

    // ── Assign dates if project_start_date provided ──────────────────────
    let finalStages = scaledStages;
    if (project_start_date) {
      finalStages = assignStageDates(scaledStages, project_start_date);
    }

    // ── Insert all stages ────────────────────────────────────────────────
    for (const s of finalStages) {
      sortOffset++;
      await client.query(
        `INSERT INTO project_activity_schedule
           (project_id, activity_no, milestone_name, phase, phase_group, step_number,
            duration_days, dependency_condition, sort_order, status, weight, created_by,
            planned_start_date, planned_end_date)
         VALUES ($1,$2,$3,$4,$4,$5,$6,$7,$8,'pending',$9,$10,$11,$12)`,
        [
          req.params.id,
          s.activity_no || String(sortOffset),
          s.milestone_name,
          s.phase,
          s.step_number,
          s.duration_days,
          s.dependency_condition || '',
          sortOffset,
          s.weight,
          req.user.id,
          s.planned_start_date || null,
          s.planned_end_date || null,
        ]
      );
      insertedCount++;
    }

    await client.query('COMMIT');

    await logAudit(db, {
      userId: req.user.id, userName: req.user.name,
      action: 'TEMPLATE_APPLIED', entityType: 'project', entityId: req.params.id,
      newData: { template_source, template_id, stages_added: insertedCount, target_days },
    });

    const { rows: stages } = await db.query(
      'SELECT * FROM project_activity_schedule WHERE project_id=$1 ORDER BY sort_order ASC',
      [req.params.id]
    );
    res.json({ success: true, data: stages });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};


const getStageTemplates = async (req, res) => {
  const { rows } = await db.query(
    `SELECT st.*, COUNT(sti.id) AS item_count
     FROM stage_templates st
     LEFT JOIN stage_template_items sti ON sti.template_id = st.id
     GROUP BY st.id ORDER BY st.created_at DESC`
  );
  res.json({ success: true, data: rows });
};

const createStageTemplate = async (req, res) => {
  const { name, description, project_type, items } = req.body;
  if (!name) return res.status(400).json({ success: false, message: 'name is required' });

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: tpl } = await client.query(
      'INSERT INTO stage_templates (name,description,project_type,created_by) VALUES ($1,$2,$3,$4) RETURNING *',
      [name, description || null, project_type || null, req.user.id]
    );

    if (Array.isArray(items) && items.length > 0) {
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        await client.query(
          `INSERT INTO stage_template_items (template_id,title,phase_group,sort_order,weight,duration_days)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [tpl[0].id, it.title, it.phase_group || null, it.sort_order ?? i, it.weight || 1, it.duration_days || 0]
        );
      }
    }
    await client.query('COMMIT');
    res.status(201).json({ success: true, data: tpl[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

// ── Stage template sample download ──────────────────────────
const downloadSampleStageTemplate = (req, res) => {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    ['Stage Name', 'Phase', 'Planned Days', 'Weight', 'Notes'],
    ['Site Measurements and Layout plan', 'Furniture Layout', 4, 1, 'Initial site visit'],
    ['Concept presentation', '3D Design', 2, 1, 'Google Slides presentation'],
    ['3D Previews and client review', '3D Design', 7, 1.5, 'All rooms'],
    ['Detailed Estimation', 'Estimation', 4, 1, ''],
    ['Plumbing working drawings', '2D Drawings', 2, 1, ''],
    ['Civil Work start', 'Execution - Civil', 30, 3, 'Main execution phase'],
    ['Carpentry Installation', 'Execution', 21, 2, ''],
    ['Site cleaning', 'Execution', 4, 1, ''],
    ['Site handover', 'Execution', 1, 1, 'Client sign-off'],
  ]);
  ws['!cols'] = [{ wch: 40 }, { wch: 22 }, { wch: 14 }, { wch: 10 }, { wch: 35 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Stage Template');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Disposition', 'attachment; filename="stage_template_sample.xlsx"');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buf);
};

// ── Import stage template from Excel/CSV ─────────────────────
const importStageTemplate = async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
  const { name, description, project_type } = req.body;
  if (!name) return res.status(400).json({ success: false, message: 'Template name is required' });

  const wb = XLSX.readFile(req.file.path);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rawRows = XLSX.utils.sheet_to_json(ws, { defval: '' });

  const getCell = (row, ...keys) => {
    for (const k of keys) {
      for (const candidate of [k, k.toLowerCase(), k.toUpperCase(), k.replace(/ /g, '_')]) {
        const v = row[candidate];
        if (v !== undefined && v !== '') return String(v).trim();
      }
    }
    return '';
  };

  const items = [];
  for (const row of rawRows) {
    const title = getCell(row, 'Stage Name', 'stage_name', 'title', 'name', 'milestone_name', 'Milestone Name');
    if (!title) continue;
    items.push({
      title,
      phase_group: getCell(row, 'Phase', 'phase', 'phase_group', 'Phase Group') || null,
      duration_days: Math.max(0, parseInt(getCell(row, 'Planned Days', 'planned_days', 'duration_days', 'Duration Days') || '0') || 0),
      weight: Math.max(0.01, parseFloat(getCell(row, 'Weight', 'weight') || '1') || 1),
    });
  }

  if (!items.length) {
    return res.status(400).json({ success: false, message: 'No valid stage rows found. Ensure the file has a "Stage Name" column.' });
  }

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: tpl } = await client.query(
      'INSERT INTO stage_templates (name, description, project_type, created_by) VALUES ($1,$2,$3,$4) RETURNING *',
      [name, description || null, project_type || null, req.user.id]
    );
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      await client.query(
        `INSERT INTO stage_template_items (template_id, title, phase_group, sort_order, weight, duration_days)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [tpl[0].id, it.title, it.phase_group, i, it.weight, it.duration_days]
      );
    }
    await client.query('COMMIT');
    res.status(201).json({ success: true, data: { ...tpl[0], item_count: items.length } });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

// ── Advance project to Kanban column (drag/drop) ─────────
const ADVANCE_COLUMN_ORDER = KANBAN_COLUMNS;
const ADVANCE_COLUMN_TO_PHASES = COLUMN_TO_PHASES;

const advanceToColumn = async (req, res) => {
  const { target_column, direction } = req.body;
  const targetIdx = ADVANCE_COLUMN_ORDER.indexOf(target_column);
  if (targetIdx === -1) return res.status(400).json({ success: false, message: 'Invalid target column' });

  if (direction === 'backward') {
    // Reset stages in phases AFTER target column to pending
    const phasesToReset = ADVANCE_COLUMN_ORDER
      .slice(targetIdx + 1)
      .flatMap(col => ADVANCE_COLUMN_TO_PHASES[col] || []);

    if (phasesToReset.length > 0) {
      await db.query(
        `UPDATE project_activity_schedule
         SET status = 'pending', completed_by = NULL, updated_at = NOW()
         WHERE project_id = $1 AND phase = ANY($2::text[])`,
        [req.params.id, phasesToReset]
      );
    }
  } else {
    // Forward: complete all stages in phases BEFORE target column
    const phasesToComplete = ADVANCE_COLUMN_ORDER
      .slice(0, targetIdx)
      .flatMap(col => ADVANCE_COLUMN_TO_PHASES[col] || []);

    if (phasesToComplete.length > 0) {
      await db.query(
        `UPDATE project_activity_schedule
         SET status = 'completed', updated_at = NOW()
         WHERE project_id = $1 AND phase = ANY($2::text[]) AND status != 'completed'`,
        [req.params.id, phasesToComplete]
      );
    }

    if (target_column === 'Completed') {
      await db.query('UPDATE projects SET status = $1 WHERE id = $2', ['completed', req.params.id]);
    }
  }

  await logAudit(db, {
    userId: req.user.id, userName: req.user.name,
    action: 'PROJECT_COLUMN_ADVANCED', entityType: 'project', entityId: req.params.id,
    newData: { target_column, direction },
  });

  res.json({ success: true });
};

// ── Bulk team member sync ────────────────────────────────
const syncTeamMembers = async (req, res) => {
  const { user_ids } = req.body;
  if (!Array.isArray(user_ids)) return res.status(400).json({ success: false, message: 'user_ids array required' });

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: before } = await client.query(
      'SELECT user_id FROM project_team WHERE project_id=$1', [req.params.id]
    );

    await client.query('DELETE FROM project_team WHERE project_id=$1', [req.params.id]);

    for (const uid of user_ids) {
      await client.query(
        'INSERT INTO project_team (project_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
        [req.params.id, uid]
      );
    }
    await client.query('COMMIT');

    await logAudit(db, {
      userId: req.user.id, userName: req.user.name,
      action: 'TEAM_UPDATED', entityType: 'project', entityId: req.params.id,
      oldData: { user_ids: before.map(r => r.user_id) },
      newData: { user_ids },
    });

    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

// ── Audit log list ────────────────────────────────────────
const getAuditLogs = async (req, res) => {
  const { entity_type, entity_id, limit = 50 } = req.query;
  let q = 'SELECT * FROM audit_logs WHERE 1=1';
  const params = [];
  let idx = 1;
  if (entity_type) { q += ` AND entity_type=$${idx++}`; params.push(entity_type); }
  if (entity_id)   { q += ` AND entity_id=$${idx++}`;   params.push(entity_id); }
  q += ` ORDER BY created_at DESC LIMIT $${idx}`;
  params.push(parseInt(limit));
  const { rows } = await db.query(q, params);
  res.json({ success: true, data: rows });
};

// ── Override updateStatus to add audit log ────────────────
const updateStatusWithAudit = async (req, res) => {
  const { status } = req.body;
  const { rows: before } = await db.query('SELECT status FROM projects WHERE id=$1', [req.params.id]);
  const { rows } = await db.query('UPDATE projects SET status = $1 WHERE id = $2 RETURNING id, name, status', [status, req.params.id]);

  await logAudit(db, {
    userId: req.user.id, userName: req.user.name,
    action: 'PROJECT_STATUS_CHANGED', entityType: 'project', entityId: req.params.id,
    oldData: { status: before[0]?.status }, newData: { status },
  });

  res.json({ success: true, data: rows[0] });
};

module.exports = {
  list, getOne, create, update,
  updateStatus: updateStatusWithAudit,
  hardDelete,
  addTeamMember, removeTeamMember, syncTeamMembers,
  upsertContractor, removeContractor,
  getSchedule, updateScheduleItem, generateSchedule,
  getStages, createStage, updateStage, deleteStage,
  applyTemplate, getStageTemplates, createStageTemplate,
  downloadSampleStageTemplate, importStageTemplate,
  getTrackerData, getAuditLogs,
  bulkImport, downloadTemplate,
  advanceToColumn,
};
