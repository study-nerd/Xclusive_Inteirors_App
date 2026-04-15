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
  // Find approved POs with no receipt submitted after 8 calendar days
  const { rows: overdue } = await db.query(`
    SELECT po.id, po.po_number, po.approved_at, po.created_by,
           po.project_id, p.name AS project_name
    FROM purchase_orders po
    LEFT JOIN projects p ON p.id = po.project_id
    WHERE po.status = 'approved'
      AND po.receipt_submitted = false
      AND po.approved_at IS NOT NULL
      AND po.approved_at < NOW() - INTERVAL '8 days'
  `);

  let count = 0;

  for (const po of overdue) {
    // Get all admin user IDs
    const { rows: admins } = await db.query(
      `SELECT id FROM users WHERE role = 'admin' AND is_active = true`
    );

    const recipients = [
      { id: po.created_by },   // PO creator (supervisor)
      ...admins,
    ];

    // Deduplicate
    const seen = new Set();
    const unique = recipients.filter(u => {
      if (!u.id || seen.has(u.id)) return false;
      seen.add(u.id); return true;
    });

    for (const u of unique) {
      // Avoid duplicate notifications — only create if none exists in last 24h
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
          `⚠️ Receipt overdue: ${po.po_number}`,
          `Purchase order ${po.po_number} (${po.project_name}) was approved ${Math.floor((Date.now() - new Date(po.approved_at)) / 86400000)} days ago but goods receipt has not been submitted.`,
          po.id,
        ]
      );
      count++;
    }
  }

  return count;
};

module.exports.checkOverdueReceipts = checkOverdueReceipts;
