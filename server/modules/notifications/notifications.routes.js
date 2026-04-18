const router = require('express').Router();
const { authenticate } = require('../../middleware/auth');
const { authorize } = require('../../middleware/role');
const db = require('../../config/db');

router.use(authenticate);

// ── Get notifications for current user ────────────────────
router.get('/', async (req, res) => {
  const { rows } = await db.query(
    `SELECT n.*, po.po_number, p.name AS project_name
     FROM notifications n
     LEFT JOIN purchase_orders po ON po.id = n.po_id
     LEFT JOIN projects p ON p.id = po.project_id
     WHERE n.user_id = $1
     ORDER BY n.created_at DESC
     LIMIT 50`,
    [req.user.id]
  );
  res.json({ success: true, data: rows });
});

// ── Unread count (for bell icon) ──────────────────────────
router.get('/unread-count', async (req, res) => {
  const { rows } = await db.query(
    'SELECT COUNT(*) FROM notifications WHERE user_id=$1 AND is_read=false',
    [req.user.id]
  );
  res.json({ success: true, count: parseInt(rows[0].count) });
});

// ── Mark single notification as read ─────────────────────
router.patch('/:id/read', async (req, res) => {
  await db.query(
    'UPDATE notifications SET is_read=true WHERE id=$1 AND user_id=$2',
    [req.params.id, req.user.id]
  );
  res.json({ success: true });
});

// ── Mark all as read ──────────────────────────────────────
router.patch('/read-all', async (req, res) => {
  await db.query(
    'UPDATE notifications SET is_read=true WHERE user_id=$1',
    [req.user.id]
  );
  res.json({ success: true });
});

// ── Admin: trigger overdue receipt check manually ─────────
router.post('/check-overdue', authorize('admin'), async (req, res) => {
  const count = await checkOverdueReceipts();
  res.json({ success: true, notified: count });
});

module.exports = router;

// ── Helper: check overdue receipts and create notifications ─
const checkOverdueReceipts = async () => {
  let count = 0;

  // Day 8+ alert — notify PO creator + all admins
  const { rows: overdue8 } = await db.query(`
    SELECT po.id, po.po_number, po.approved_at, po.created_by, p.name AS project_name
    FROM purchase_orders po
    LEFT JOIN projects p ON p.id = po.project_id
    WHERE po.status = 'approved'
      AND po.receipt_submitted = false
      AND po.approved_at IS NOT NULL
      AND po.approved_at < NOW() - INTERVAL '8 days'
  `);

  for (const po of overdue8) {
    const { rows: admins } = await db.query(
      `SELECT id FROM users WHERE role = 'admin' AND is_active = true`
    );
    const recipients = [{ id: po.created_by }, ...admins];
    const seen = new Set();
    const unique = recipients.filter(u => u.id && !seen.has(u.id) && seen.add(u.id));
    const daysLate = Math.floor((Date.now() - new Date(po.approved_at)) / 86400000);

    for (const u of unique) {
      const { rows: existing } = await db.query(
        `SELECT id FROM notifications
         WHERE user_id=$1 AND po_id=$2 AND type='receipt_overdue'
           AND created_at > NOW() - INTERVAL '24 hours'`,
        [u.id, po.id]
      );
      if (existing.length) continue;

      await db.query(
        `INSERT INTO notifications (user_id, type, title, body, po_id)
         VALUES ($1,'receipt_overdue',$2,$3,$4)`,
        [
          u.id,
          `🚨 Receipt overdue: ${po.po_number}`,
          `PO ${po.po_number} (${po.project_name}) was approved ${daysLate} days ago — goods receipt not yet submitted.`,
          po.id,
        ]
      );
      count++;
    }
  }

  // Day 6 reminder — notify PO creator only
  const { rows: reminder6 } = await db.query(`
    SELECT po.id, po.po_number, po.approved_at, po.created_by, p.name AS project_name
    FROM purchase_orders po
    LEFT JOIN projects p ON p.id = po.project_id
    WHERE po.status = 'approved'
      AND po.receipt_submitted = false
      AND po.approved_at IS NOT NULL
      AND po.approved_at < NOW() - INTERVAL '6 days'
      AND po.approved_at >= NOW() - INTERVAL '8 days'
  `);

  for (const po of reminder6) {
    const { rows: existing } = await db.query(
      `SELECT id FROM notifications
       WHERE user_id=$1 AND po_id=$2 AND type='receipt_reminder'
         AND created_at > NOW() - INTERVAL '24 hours'`,
      [po.created_by, po.id]
    );
    if (existing.length) continue;

    await db.query(
      `INSERT INTO notifications (user_id, type, title, body, po_id)
       VALUES ($1,'receipt_reminder',$2,$3,$4)`,
      [
        po.created_by,
        `🔔 Receipt reminder: ${po.po_number}`,
        `Please submit goods receipt for PO ${po.po_number} (${po.project_name}) within 2 days to avoid an overdue alert.`,
        po.id,
      ]
    );
    count++;
  }

  return count;
};

module.exports.checkOverdueReceipts = checkOverdueReceipts;
