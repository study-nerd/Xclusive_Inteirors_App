require('dotenv').config();
require('express-async-errors');

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const path = require('path');
const { rateLimiter } = require('./middleware/rateLimiter');

const app = express();
const allowedOrigins = (process.env.CLIENT_URL || 'http://localhost:3000')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

app.use(helmet());
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    return cb(null, false);
  },
  credentials: true,
}));
app.use('/api/auth', rateLimiter);    
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ── Routes ────────────────────────────────────────────────
app.use('/api/auth',              require('./modules/auth/auth.routes'));
app.use('/api/users',             require('./modules/users/users.routes'));
app.use('/api/projects',          require('./modules/projects/projects.routes'));
app.use('/api/vendors',           require('./modules/vendors/vendors.routes'));
app.use('/api/categories',        require('./modules/categories/categories.routes'));
app.use('/api/elements',          require('./modules/elements/elements.routes'));
app.use('/api/purchase-orders',   require('./modules/purchase-orders/po.routes'));
app.use('/api/dpr',               require('./modules/dpr/dpr.routes'));
app.use('/api/checklist',         require('./modules/checklist/checklist.routes'));
app.use('/api/snaglist',          require('./modules/snaglist/snaglist.routes'));
app.use('/api/activity-schedule', require('./modules/activity-schedule/activity.routes'));
app.use('/api/invoices',          require('./modules/invoices/invoices.routes'));
app.use('/api/notifications',     require('./modules/notifications/notifications.routes'));
app.use('/api/attendance',        require('./modules/attendance/attendance.routes'));

app.get('/api/health', (req, res) => res.json({ status: 'ok', timestamp: new Date() }));

app.use((err, req, res, next) => {
  console.error(err.stack);
  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    success: false,
    message: err.message || 'Internal Server Error',
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server running on port ${PORT}`);
  const { runAutoMigrations } = require('./db/autoMigrate');
  runAutoMigrations().finally(() => {
    const { startOverdueChecker } = require('./utils/overdueChecker');
    startOverdueChecker();
  });
});
