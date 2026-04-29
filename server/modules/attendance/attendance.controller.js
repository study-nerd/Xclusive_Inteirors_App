const db = require('../../config/db');

// ─────────────────────────────────────────────────────────────────────────────
// BACKEND CONFIG — edit these values to change attendance rules
// ─────────────────────────────────────────────────────────────────────────────
const OFFICE_LAT             = 18.593702;
const OFFICE_LNG             = 73.792505;
const GEOFENCE_RADIUS_METERS = 100;    // ← change fence radius (meters) here

const WORK_START_HOUR        = 10;     // 10:00 AM IST
const WORK_END_HOUR          = 19;     // 7:00 PM IST
const LATE_AFTER_MINUTES     = 1;      // > 10:01 AM = late
const HALF_DAY_AFTER_MINUTES = 30;     // > 10:30 AM = half_day
// ─────────────────────────────────────────────────────────────────────────────

function haversineDistance(lat1, lng1, lat2, lng2) {
  const R    = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a    =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// IST = UTC + 5:30 (shift so .getUTC*() methods return IST values)
function getNowIST() {
  return new Date(Date.now() + 5.5 * 3600 * 1000);
}

function getTodayIST() {
  return getNowIST().toISOString().slice(0, 10);
}

function computeClockInStatus(istDate) {
  const h = istDate.getUTCHours();
  const m = istDate.getUTCMinutes();
  if (h < WORK_START_HOUR) return 'present';
  const minutesAfterStart = (h - WORK_START_HOUR) * 60 + m;
  if (minutesAfterStart > HALF_DAY_AFTER_MINUTES) return 'half_day';
  if (minutesAfterStart > LATE_AFTER_MINUTES)     return 'late';
  return 'present';
}

// ─── Clock In ────────────────────────────────────────────────────────────────
async function clockIn(req, res) {
  const userId = req.user.id;
  const lat    = parseFloat(req.body.lat);
  const lng    = parseFloat(req.body.lng);
  const selfie = req.file;

  if (isNaN(lat) || isNaN(lng)) {
    return res.status(400).json({ success: false, message: 'Location (lat/lng) required.' });
  }

  const istNow    = getNowIST();
  const today     = getTodayIST();
  const dayOfWeek = istNow.getUTCDay(); // 0 = Sunday

  if (dayOfWeek === 0) {
    return res.status(400).json({ success: false, message: 'Sunday is a day off.' });
  }

  const { rows: holidays } = await db.query(
    'SELECT name FROM company_holidays WHERE date = $1', [today]
  );
  if (holidays.length) {
    return res.status(400).json({ success: false, message: `Today is a company holiday: ${holidays[0].name}` });
  }

  const { rows: leaves } = await db.query(
    `SELECT id FROM leave_requests
     WHERE user_id = $1 AND status = 'approved' AND $2::date BETWEEN start_date AND end_date`,
    [userId, today]
  );
  if (leaves.length) {
    return res.status(400).json({ success: false, message: 'You have an approved leave today.' });
  }

  const { rows: existing } = await db.query(
    'SELECT id, clock_in_time FROM attendance WHERE user_id = $1 AND date = $2',
    [userId, today]
  );
  if (existing.length && existing[0].clock_in_time) {
    return res.status(400).json({ success: false, message: 'Already clocked in today.' });
  }

  const distance    = haversineDistance(lat, lng, OFFICE_LAT, OFFICE_LNG);
  const insideFence = distance <= GEOFENCE_RADIUS_METERS;

  if (!insideFence && !selfie) {
    return res.status(422).json({
      success:     false,
      needsSelfie: true,
      message:     `You are ${Math.round(distance)}m from office. Please upload a selfie to clock in.`,
      distance:    Math.round(distance),
    });
  }

  const status     = computeClockInStatus(istNow);
  const selfiePath = selfie ? `/uploads/attendance-selfies/${selfie.filename}` : null;

  // Snap clock-in time to exactly 10:00 AM IST when arriving within the present window
  // (10:00:00 – 10:01:59 IST) so it never displays as "10:01 AM"
  let nowUTC = new Date();
  const istH = istNow.getUTCHours();
  const istM = istNow.getUTCMinutes();
  if (istH === WORK_START_HOUR && istM <= LATE_AFTER_MINUTES) {
    // 10:00 AM IST = 04:30:00 UTC on the same IST calendar date
    nowUTC = new Date(today + 'T04:30:00.000Z');
  }

  if (existing.length) {
    await db.query(
      `UPDATE attendance SET
         clock_in_time = $1, status = $2,
         clock_in_lat = $3, clock_in_lng = $4,
         clock_in_inside_fence = $5, clock_in_selfie = $6, updated_at = NOW()
       WHERE user_id = $7 AND date = $8`,
      [nowUTC, status, lat, lng, insideFence, selfiePath, userId, today]
    );
  } else {
    await db.query(
      `INSERT INTO attendance
         (user_id, date, clock_in_time, status, clock_in_lat, clock_in_lng, clock_in_inside_fence, clock_in_selfie)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [userId, today, nowUTC, status, lat, lng, insideFence, selfiePath]
    );
  }

  res.json({ success: true, message: 'Clocked in successfully.', status, insideFence, distance: Math.round(distance) });
}

// ─── Clock Out ───────────────────────────────────────────────────────────────
async function clockOut(req, res) {
  const userId    = req.user.id;
  const lat       = parseFloat(req.body.lat);
  const lng       = parseFloat(req.body.lng);
  const earlyNote = req.body.early_logout_note?.trim() || null;
  const selfie    = req.file;

  if (isNaN(lat) || isNaN(lng)) {
    return res.status(400).json({ success: false, message: 'Location (lat/lng) required.' });
  }

  const today  = getTodayIST();
  const istNow = getNowIST();

  const { rows: existing } = await db.query(
    'SELECT id, clock_in_time, clock_out_time FROM attendance WHERE user_id = $1 AND date = $2',
    [userId, today]
  );

  if (!existing.length || !existing[0].clock_in_time) {
    return res.status(400).json({ success: false, message: 'You have not clocked in today.' });
  }
  if (existing[0].clock_out_time) {
    return res.status(400).json({ success: false, message: 'Already clocked out today.' });
  }

  const distance    = haversineDistance(lat, lng, OFFICE_LAT, OFFICE_LNG);
  const insideFence = distance <= GEOFENCE_RADIUS_METERS;

  if (!insideFence && !selfie) {
    return res.status(422).json({
      success:     false,
      needsSelfie: true,
      message:     `You are ${Math.round(distance)}m from office. Please upload a selfie to clock out.`,
      distance:    Math.round(distance),
    });
  }

  const istHour     = istNow.getUTCHours();
  const earlyLogout = istHour < WORK_END_HOUR;

  if (earlyLogout && !earlyNote) {
    return res.status(400).json({
      success:       false,
      needsEarlyNote: true,
      message:       'You are leaving before 7:00 PM. Please provide a reason for early logout.',
    });
  }

  const nowUTC      = new Date();
  const clockInTime = new Date(existing[0].clock_in_time);
  const totalHours  = parseFloat(((nowUTC - clockInTime) / 3600000).toFixed(2));
  const selfiePath  = selfie ? `/uploads/attendance-selfies/${selfie.filename}` : null;

  await db.query(
    `UPDATE attendance SET
       clock_out_time = $1, total_hours = $2,
       clock_out_lat = $3, clock_out_lng = $4,
       clock_out_inside_fence = $5, clock_out_selfie = $6,
       early_logout = $7, early_logout_note = $8,
       is_flagged = CASE WHEN $7 THEN true ELSE is_flagged END,
       flagged_reason = CASE
         WHEN $7 AND (flagged_reason IS NULL OR flagged_reason = '') THEN 'Early logout'
         WHEN $7 THEN flagged_reason || ', Early logout'
         ELSE flagged_reason END,
       updated_at = NOW()
     WHERE user_id = $9 AND date = $10`,
    [nowUTC, totalHours, lat, lng, insideFence, selfiePath, earlyLogout, earlyNote, userId, today]
  );

  res.json({ success: true, message: 'Clocked out successfully.', earlyLogout, totalHours });
}

// ─── Today's Status ───────────────────────────────────────────────────────────
async function getToday(req, res) {
  const userId = req.user.id;
  const today  = getTodayIST();

  const { rows: holidays } = await db.query('SELECT name FROM company_holidays WHERE date = $1', [today]);
  if (holidays.length) {
    return res.json({ success: true, data: { date: today, status: 'holiday', holiday_name: holidays[0].name } });
  }

  if (getNowIST().getUTCDay() === 0) {
    return res.json({ success: true, data: { date: today, status: 'sunday' } });
  }

  const { rows: leaves } = await db.query(
    `SELECT id FROM leave_requests
     WHERE user_id = $1 AND status = 'approved' AND $2::date BETWEEN start_date AND end_date`,
    [userId, today]
  );
  if (leaves.length) {
    return res.json({ success: true, data: { date: today, status: 'leave' } });
  }

  const { rows: att } = await db.query(
    'SELECT * FROM attendance WHERE user_id = $1 AND date = $2', [userId, today]
  );
  res.json({ success: true, data: att.length ? att[0] : { date: today, status: null } });
}

// ─── Monthly (shared logic) ───────────────────────────────────────────────────
async function buildMonthly(userId, year, month) {
  const firstDay   = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDayNum = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const lastDay    = `${year}-${String(month).padStart(2, '0')}-${String(lastDayNum).padStart(2, '0')}`;

  const { rows: records } = await db.query(
    `SELECT * FROM attendance WHERE user_id = $1 AND date >= $2::date AND date <= $3::date ORDER BY date`,
    [userId, firstDay, lastDay]
  );
  const recordMap = {};
  records.forEach(r => { recordMap[r.date.toISOString().slice(0, 10)] = r; });

  const { rows: holidays } = await db.query(
    `SELECT date, name FROM company_holidays WHERE date >= $1::date AND date <= $2::date`,
    [firstDay, lastDay]
  );
  const holidayMap = {};
  holidays.forEach(h => { holidayMap[h.date.toISOString().slice(0, 10)] = h.name; });

  const { rows: leaves } = await db.query(
    `SELECT start_date, end_date FROM leave_requests
     WHERE user_id = $1 AND status = 'approved' AND start_date <= $3::date AND end_date >= $2::date`,
    [userId, firstDay, lastDay]
  );
  const leaveDates = new Set();
  leaves.forEach(l => {
    const s = new Date(l.start_date);
    const e = new Date(l.end_date);
    for (let d = new Date(s.getTime()); d.getTime() <= e.getTime(); d.setUTCDate(d.getUTCDate() + 1)) {
      leaveDates.add(d.toISOString().slice(0, 10));
    }
  });

  const today  = getTodayIST();
  const result = [];

  for (let d = 1; d <= lastDayNum; d++) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

    if (dateStr > today) { result.push({ date: dateStr, status: 'future' }); continue; }

    const dow = new Date(dateStr + 'T00:00:00Z').getUTCDay();

    if (holidayMap[dateStr]) {
      result.push({ date: dateStr, status: 'holiday', holiday_name: holidayMap[dateStr] });
    } else if (dow === 0) {
      result.push({ date: dateStr, status: 'sunday' });
    } else if (leaveDates.has(dateStr)) {
      result.push({ date: dateStr, status: 'leave' });
    } else if (recordMap[dateStr]) {
      const rec     = recordMap[dateStr];
      const flagged = rec.is_flagged || (dateStr < today && rec.clock_in_time && !rec.clock_out_time);
      result.push({ ...rec, date: dateStr, is_flagged: flagged,
        clock_in_time:  rec.clock_in_time  ? rec.clock_in_time.toISOString()  : null,
        clock_out_time: rec.clock_out_time ? rec.clock_out_time.toISOString() : null,
      });
    } else {
      result.push({ date: dateStr, status: 'absent' });
    }
  }
  return result;
}

async function getMyMonthly(req, res) {
  const year  = parseInt(req.query.year)  || getNowIST().getUTCFullYear();
  const month = parseInt(req.query.month) || (getNowIST().getUTCMonth() + 1);
  const data  = await buildMonthly(req.user.id, year, month);
  res.json({ success: true, data, year, month });
}

async function getAdminMonthly(req, res) {
  const uid = req.query.user_id;
  if (!uid) return res.status(400).json({ success: false, message: 'user_id required.' });
  const year  = parseInt(req.query.year)  || getNowIST().getUTCFullYear();
  const month = parseInt(req.query.month) || (getNowIST().getUTCMonth() + 1);
  const data  = await buildMonthly(uid, year, month);
  res.json({ success: true, data, year, month });
}

// ─── Admin: Today Overview ────────────────────────────────────────────────────
async function adminTodayOverview(req, res) {
  const today = getTodayIST();

  const { rows: users }    = await db.query('SELECT id, name, role FROM users WHERE is_active = true ORDER BY name');
  const { rows: attToday } = await db.query('SELECT * FROM attendance WHERE date = $1', [today]);
  const attMap = {};
  attToday.forEach(a => {
    attMap[a.user_id] = {
      ...a,
      clock_in_time:  a.clock_in_time  ? a.clock_in_time.toISOString()  : null,
      clock_out_time: a.clock_out_time ? a.clock_out_time.toISOString() : null,
    };
  });

  const { rows: holidays } = await db.query('SELECT id FROM company_holidays WHERE date = $1', [today]);
  const isHoliday          = holidays.length > 0;
  const isSunday           = getNowIST().getUTCDay() === 0;

  const { rows: leavesToday } = await db.query(
    `SELECT user_id FROM leave_requests WHERE status = 'approved' AND $1::date BETWEEN start_date AND end_date`,
    [today]
  );
  const onLeave = new Set(leavesToday.map(l => l.user_id));

  const data = users.map(u => {
    if (isHoliday)          return { ...u, status: 'holiday', date: today };
    if (isSunday)           return { ...u, status: 'sunday',  date: today };
    if (onLeave.has(u.id))  return { ...u, status: 'leave',   date: today };
    if (attMap[u.id]) {
      const a = attMap[u.id];
      const flagged = a.is_flagged || (a.clock_in_time && !a.clock_out_time);
      return { ...u, ...a, is_flagged: flagged };
    }
    return { ...u, status: 'absent', date: today };
  });

  res.json({ success: true, data, today, isHoliday, isSunday });
}

// ─── Leave Requests ───────────────────────────────────────────────────────────
async function requestLeave(req, res) {
  const userId                          = req.user.id;
  const { start_date, end_date, reason } = req.body;

  if (!start_date || !end_date || !reason?.trim()) {
    return res.status(400).json({ success: false, message: 'start_date, end_date, and reason are required.' });
  }

  const istTomorrow = getNowIST();
  istTomorrow.setUTCDate(istTomorrow.getUTCDate() + 1);
  const tomorrowStr = istTomorrow.toISOString().slice(0, 10);

  if (start_date < tomorrowStr) {
    return res.status(400).json({ success: false, message: 'Leave must be requested at least 24 hours in advance.' });
  }
  if (end_date < start_date) {
    return res.status(400).json({ success: false, message: 'end_date must be on or after start_date.' });
  }

  const numDays = Math.round(
    (new Date(end_date + 'T00:00:00Z') - new Date(start_date + 'T00:00:00Z')) / 86400000
  ) + 1;

  const { rows: overlap } = await db.query(
    `SELECT id FROM leave_requests
     WHERE user_id = $1 AND status IN ('pending','approved') AND start_date <= $3::date AND end_date >= $2::date`,
    [userId, start_date, end_date]
  );
  if (overlap.length) {
    return res.status(400).json({ success: false, message: 'You already have a leave request overlapping this period.' });
  }

  const { rows } = await db.query(
    `INSERT INTO leave_requests (user_id, start_date, end_date, num_days, reason)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [userId, start_date, end_date, numDays, reason.trim()]
  );
  res.status(201).json({ success: true, data: rows[0] });
}

async function cancelLeave(req, res) {
  const userId = req.user.id;
  const { id } = req.params;

  const { rows } = await db.query(
    'SELECT * FROM leave_requests WHERE id = $1 AND user_id = $2', [id, userId]
  );
  if (!rows.length) {
    return res.status(404).json({ success: false, message: 'Leave request not found.' });
  }

  const leave = rows[0];
  if (leave.status !== 'pending') {
    return res.status(400).json({ success: false, message: 'Only pending leave requests can be cancelled.' });
  }

  // Cancel window: must be more than 12h before start date (IST midnight)
  const startStr          = leave.start_date.toISOString().slice(0, 10);
  const startMidnightUTC  = new Date(startStr + 'T00:00:00Z').getTime();
  // IST midnight = startMidnightUTC - 5.5h; 12h before that = - 17.5h total
  const cancelDeadlineUTC = startMidnightUTC - 17.5 * 3600 * 1000;

  if (Date.now() > cancelDeadlineUTC) {
    return res.status(400).json({ success: false, message: 'Cannot cancel leave within 12 hours of the start date.' });
  }

  await db.query('DELETE FROM leave_requests WHERE id = $1', [id]);
  res.json({ success: true, message: 'Leave request cancelled.' });
}

async function getMyLeaves(req, res) {
  const { rows } = await db.query(
    `SELECT lr.*, u.name AS reviewed_by_name
     FROM leave_requests lr
     LEFT JOIN users u ON u.id = lr.reviewed_by
     WHERE lr.user_id = $1 ORDER BY lr.created_at DESC`,
    [req.user.id]
  );
  res.json({ success: true, data: rows });
}

async function getPendingLeaves(req, res) {
  const { rows } = await db.query(
    `SELECT lr.*, u.name AS user_name, u.role AS user_role
     FROM leave_requests lr JOIN users u ON u.id = lr.user_id
     WHERE lr.status = 'pending' ORDER BY lr.start_date ASC`
  );
  res.json({ success: true, data: rows });
}

async function getAllLeaves(req, res) {
  const { rows } = await db.query(
    `SELECT lr.*, u.name AS user_name, rv.name AS reviewed_by_name
     FROM leave_requests lr
     JOIN users u ON u.id = lr.user_id
     LEFT JOIN users rv ON rv.id = lr.reviewed_by
     ORDER BY lr.created_at DESC LIMIT 300`
  );
  res.json({ success: true, data: rows });
}

async function reviewLeave(req, res) {
  const { id }                  = req.params;
  const { action, review_note } = req.body;

  if (!['approve', 'reject'].includes(action)) {
    return res.status(400).json({ success: false, message: "action must be 'approve' or 'reject'." });
  }

  const status   = action === 'approve' ? 'approved' : 'rejected';
  const { rows } = await db.query(
    `UPDATE leave_requests SET status=$1, reviewed_by=$2, reviewed_at=NOW(), review_note=$3
     WHERE id=$4 AND status='pending' RETURNING *`,
    [status, req.user.id, review_note?.trim() || null, id]
  );
  if (!rows.length) {
    return res.status(404).json({ success: false, message: 'Leave request not found or already reviewed.' });
  }
  res.json({ success: true, data: rows[0] });
}

// ─── Holidays ─────────────────────────────────────────────────────────────────
async function getHolidays(req, res) {
  const year     = parseInt(req.query.year) || getNowIST().getUTCFullYear();
  const { rows } = await db.query(
    `SELECT * FROM company_holidays WHERE EXTRACT(YEAR FROM date) = $1 ORDER BY date`, [year]
  );
  res.json({ success: true, data: rows });
}

async function createHoliday(req, res) {
  const { date, name } = req.body;
  if (!date || !name?.trim()) {
    return res.status(400).json({ success: false, message: 'date and name are required.' });
  }
  const { rows } = await db.query(
    `INSERT INTO company_holidays (date, name, created_by) VALUES ($1,$2,$3)
     ON CONFLICT (date) DO UPDATE SET name = EXCLUDED.name RETURNING *`,
    [date, name.trim(), req.user.id]
  );
  res.status(201).json({ success: true, data: rows[0] });
}

async function deleteHoliday(req, res) {
  await db.query('DELETE FROM company_holidays WHERE id = $1', [req.params.id]);
  res.json({ success: true });
}

async function getUsers(req, res) {
  const { rows } = await db.query('SELECT id, name, role FROM users WHERE is_active = true ORDER BY name');
  res.json({ success: true, data: rows });
}

// ─── Public config (single source of truth for frontend) ─────────────────────
function getConfig(req, res) {
  res.json({
    success: true,
    data: {
      officeLat:      OFFICE_LAT,
      officeLng:      OFFICE_LNG,
      geofenceRadius: GEOFENCE_RADIUS_METERS,
    },
  });
}

module.exports = {
  clockIn, clockOut, getToday,
  getMyMonthly, getAdminMonthly, adminTodayOverview,
  requestLeave, cancelLeave, getMyLeaves, getPendingLeaves, getAllLeaves, reviewLeave,
  getHolidays, createHoliday, deleteHoliday,
  getUsers, getConfig,
};
