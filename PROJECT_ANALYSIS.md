# Xclusive Interiors — Complete System Architecture & Developer Reference
> Version: 2.0 | Date: 2026-04-21 | Classification: Internal — Stakeholder Reference
> System: PO & Project Management ERP | Environment: Hostinger VPS, Docker Compose
> Users: ~25 concurrent | Stack: React 18 + Node.js + PostgreSQL + Docker

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Technology Stack](#2-technology-stack)
3. [Directory Structure](#3-directory-structure)
4. [Docker & Deployment Architecture](#4-docker--deployment-architecture)
5. [Backend Architecture — Entry Point](#5-backend-architecture--entry-point)
6. [Middleware Layer](#6-middleware-layer)
7. [Database Configuration & Connection Pool](#7-database-configuration--connection-pool)
8. [Auto-Migration System](#8-auto-migration-system)
9. [Backend Modules — Complete Reference](#9-backend-modules--complete-reference)
10. [Frontend Architecture](#10-frontend-architecture)
11. [Database Schema — All Tables](#11-database-schema--all-tables)
12. [Complete API Endpoint Reference](#12-complete-api-endpoint-reference)
13. [Authentication & Authorization Flow](#13-authentication--authorization-flow)
14. [Key Business Flows](#14-key-business-flows)
15. [Frontend ↔ Backend Connection Map](#15-frontend--backend-connection-map)
16. [Security Model & Threat Analysis](#16-security-model--threat-analysis)
17. [Diagnosis: Issues, Loose Ends & Recommendations](#17-diagnosis-issues-loose-ends--recommendations)

---

## 1. Project Overview

Xclusive Interiors Pvt. Ltd. is an interior design and architecture firm based in Pune. This system is a full-featured **internal ERP** for managing the company's projects, purchase orders, vendors, daily reports, invoices, and team workflows.

**Business Context:**
- Company: Xclusive Interiors Pvt. Ltd., 208 Vision Galleria, Pimple Saudagar, Pune 411027
- GSTIN: 27AAACX1884C1ZD
- Users: ~25 internal staff (admins, managers, employees/field staff)
- Hosted on: Hostinger VPS (Linux), Docker Compose
- Access: Internal web app at a domain configured via `CLIENT_URL` env var

**Core Modules:**
- **Dashboard** — summary cards, quick stats
- **Projects** — project lifecycle, stages, team, schedule, checklists, snags
- **Project Tracker** — Kanban board + table view of all active projects
- **Purchase Orders (PO)** — full PO lifecycle: draft → submitted → approved → receipt
- **Vendors** — vendor master with bank/GST details
- **Elements Master** — material/item catalog with categories
- **Daily Progress Reports (DPR)** — site visit reports with images and voice notes
- **Checklist** — project-specific task checklists from templates
- **Snag List** — defect/issue tracking with images and files
- **Invoices** — invoice record keeping with file attachments
- **Notifications** — in-app alerts for receipt deadlines, overdue POs
- **Users** — user management, roles, password management

---

## 2. Technology Stack

### Backend
| Layer | Technology | Version/Notes |
|-------|-----------|---------------|
| Runtime | Node.js | v18+ |
| Framework | Express.js | REST API |
| Database | PostgreSQL | v15 (Docker), v18 on host |
| DB Driver | `pg` (node-postgres) | Connection Pool (`Pool`) |
| Auth | JSON Web Token (`jsonwebtoken`) | Cookie-based + Bearer header |
| Password | `bcryptjs` | Hash + compare |
| File Upload | `multer` | Disk storage, /tmp for imports |
| Excel I/O | `xlsx` | Bulk import/export templates |
| PDF Gen | `pdfkit` (`server/utils/pdf.js`) | PO and receipt PDFs |
| Email | `nodemailer` + Gmail | PO notifications |
| Validation | `express-validator` | Input validation middleware |
| Error Handling | `express-async-errors` | Auto-catch async errors |
| Rate Limiting | `express-rate-limit` | 100 req / 15 min |
| Security | `helmet` | HTTP security headers |
| CORS | `cors` | Origin whitelist from `CLIENT_URL` |
| Logging | `morgan` | Dev format HTTP logs |
| UUID | `uuid` (v4) | File naming in uploads |

### Frontend
| Layer | Technology | Notes |
|-------|-----------|-------|
| Framework | React 18 | Functional components, hooks |
| Build Tool | Vite | Fast HMR, env vars as `VITE_*` |
| Routing | React Router v6 | `<Routes>` + `<Navigate>` |
| Server State | TanStack Query (React Query v5) | `useQuery`, `useMutation` |
| Client State | Zustand | Auth store, invoice store |
| HTTP Client | Axios | Configured at `/api` base URL |
| Styling | Tailwind CSS v3 | Utility-first, PostCSS |
| Icons | Lucide React | SVG icons |
| UI Components | Custom shared components | `client/src/components/shared/index.jsx` |
| Drag & Drop | HTML5 native | Kanban board |

### Infrastructure
| Component | Technology | Notes |
|-----------|-----------|-------|
| Container | Docker + Docker Compose v3.8 | 3 services: postgres, server, client |
| Web Server | Nginx (in client container) | Serves built React app on port 80→3000 |
| VPS | Hostinger VPS | Linux, ports 3000 and 5000 exposed |
| Volumes | Docker named volume `postgres_data` | DB persistence |
| File Storage | Server filesystem (`./server/uploads`) | Bind-mounted to container |

---

## 3. Directory Structure

```
xclusive-interiors/
├── docker-compose.yml          # 3-service Docker orchestration
├── generate_pdf.py             # Python: converts PROJECT_ANALYSIS.md → PDF
├── backup_before_tracker.sql   # DB snapshot taken before Project Tracker upgrade
├── README.md
│
├── client/                     # React 18 + Vite frontend
│   ├── Dockerfile              # Multi-stage: build → nginx serve
│   ├── vite.config.js          # Vite config: proxy /api → server:5000
│   ├── tailwind.config.js      # Tailwind theme config
│   ├── postcss.config.js       # PostCSS (autoprefixer)
│   ├── package.json            # Frontend deps
│   └── src/
│       ├── main.jsx            # React root: BrowserRouter, QueryClient, App
│       ├── App.jsx             # Route tree + protected route wrapper
│       ├── lib/
│       │   ├── api.js          # Axios instance (baseURL=/api, withCredentials)
│       │   └── utils.js        # cn() helper (clsx + tailwind-merge)
│       ├── store/
│       │   ├── authStore.js    # Zustand: user state, login/logout/fetchMe
│       │   └── invoiceStore.js # Zustand: invoice filters
│       ├── components/
│       │   ├── layout/
│       │   │   ├── AppLayout.jsx      # Sidebar + topbar + <Outlet />
│       │   │   └── ProtectedRoute.jsx # Redirects to /login if unauthenticated
│       │   └── shared/
│       │       ├── index.jsx          # Button, Input, Select, Modal, Badge, etc.
│       │       └── BulkImportModal.jsx
│       └── pages/
│           ├── auth/LoginPage.jsx
│           ├── dashboard/DashboardPage.jsx
│           ├── projects/
│           │   ├── ProjectsPage.jsx       # List + filter + bulk import
│           │   ├── ProjectDetailPage.jsx  # Tabbed: Overview/Stages/POs/DPR/Snags/Team
│           │   ├── ProjectFormPage.jsx    # Create/edit form
│           │   └── StagesTab.jsx          # Stage engine UI (phases, kanban, drive links)
│           ├── project-tracker/
│           │   └── ProjectTrackerPage.jsx # Kanban + Table views, filters, drag/drop
│           ├── purchase-orders/
│           │   ├── POListPage.jsx
│           │   ├── POFormPage.jsx
│           │   └── PODetailPage.jsx       # PO detail, approval, receipt, PDF
│           ├── vendors/
│           │   ├── VendorsPage.jsx
│           │   └── VendorFormPage.jsx
│           ├── elements/ElementsPage.jsx
│           ├── categories/CategoriesPage.jsx
│           ├── dpr/
│           │   ├── DPRListPage.jsx
│           │   ├── DPRFormPage.jsx
│           │   └── DPRDetailPage.jsx
│           ├── checklist/ChecklistPage.jsx
│           ├── snaglist/SnaglistPage.jsx
│           ├── invoices/InvoicesPage.jsx
│           ├── notifications/NotificationsPage.jsx
│           ├── users/UsersPage.jsx
│           └── profile/ProfilePage.jsx
│
└── server/                     # Node.js + Express backend
    ├── Dockerfile              # Node 18-alpine image
    ├── package.json            # Backend deps
    ├── index.js                # Express app entry point
    ├── config/
    │   └── db.js               # pg.Pool connection config
    ├── middleware/
    │   ├── auth.js             # authenticate: JWT verify → req.user
    │   ├── role.js             # authorize(...roles): role-based guard
    │   ├── rateLimiter.js      # express-rate-limit (100/15min)
    │   └── uploadValidator.js  # File size + MIME type check post-multer
    ├── db/
    │   ├── autoMigrate.js      # Idempotent schema patches run at startup
    │   └── migrations/         # Numbered SQL files (Docker init & manual ref)
    │       ├── 001_init.sql    # Core schema: all tables
    │       ├── 002_seed.sql    # Admin user + 45 activity schedule templates
    │       ├── 003_patches.sql # Schema patches round 1
    │       ├── 004_snag_files.sql
    │       ├── 005_invoices.sql
    │       ├── 006_vendor_categories.sql
    │       ├── 007_goods_receipt_notifications.sql
    │       ├── 008_line_item_images.sql
    │       ├── 009_receipt_verification.sql
    │       └── 010_project_stages.sql  # Stage engine tables + status enum
    ├── modules/               # Feature modules (routes + controllers)
    │   ├── auth/              auth.routes.js, auth.controller.js
    │   ├── users/             users.routes.js, users.controller.js
    │   ├── projects/          projects.routes.js, projects.controller.js
    │   ├── purchase-orders/   po.routes.js, po.controller.js
    │   ├── vendors/           vendors.routes.js, vendors.controller.js
    │   ├── categories/        categories.routes.js
    │   ├── elements/          elements.routes.js, elements.controller.js
    │   ├── dpr/               dpr.routes.js (inline controller)
    │   ├── checklist/         checklist.routes.js (inline controller)
    │   ├── snaglist/          snaglist.routes.js (inline controller)
    │   ├── invoices/          invoices.routes.js, invoices.controller.js
    │   ├── notifications/     notifications.routes.js (inline + helper)
    │   └── activity-schedule/ activity.routes.js (inline controller)
    └── utils/
        ├── email.js           # Nodemailer: PO approval/rejection emails
        ├── overdueChecker.js  # setInterval job: flag overdue PO receipts
        ├── pdf.js             # PDFKit: generate PO PDF, receipt PDF
        └── validate.js        # express-validator result middleware
```

---

## 4. Docker & Deployment Architecture

### `docker-compose.yml` Services

**postgres** (PostgreSQL 15-alpine)
- Mounts `./server/db/migrations` → `/docker-entrypoint-initdb.d` so all numbered SQL files run in order on first container creation
- Health check: `pg_isready` every 5s
- Named volume `postgres_data` for persistence across container restarts
- Env: `DB_USER`, `DB_PASSWORD`, `DB_NAME` from `.env` file

**server** (Node.js Express API)
- Built from `./server/Dockerfile` (Node 18-alpine)
- Port `5000:5000` exposed to host
- Env vars: full database connection + JWT + email + company info from `.env`
- Depends on `postgres` health check being healthy
- Volume bind: `./server/uploads` → `/app/uploads` (file persistence outside container)
- On startup: runs `autoMigrate.js` (idempotent patches), then starts `overdueChecker.js`

**client** (React + Nginx)
- Built from `./client/Dockerfile` (multi-stage: Node build → nginx:alpine serve)
- Build arg `VITE_API_URL` passed from `.env` (sets base URL for API calls)
- Port `3000:80` — serves built static files via Nginx
- Depends on server (starts after)

### Environment Variables (`.env` at root, not committed)

```
DB_USER=xclusive_user
DB_PASSWORD=<secret>
DB_NAME=xclusive_db
JWT_SECRET=<secret>
JWT_EXPIRES_IN=7d
GMAIL_USER=notifications@company.com
GMAIL_APP_PASSWORD=<app-password>
CLIENT_URL=https://your-domain.com
VITE_API_URL=/api
COMPANY_NAME=Xclusive Interiors Pvt. Ltd.
COMPANY_ADDRESS=208, Vision Galleria, Near Kunal Icon, Pimple Saudagar, Pune 411027
COMPANY_GSTIN=27AAACX1884C1ZD
```

### Deployment Flow
1. `git pull` latest code on VPS
2. `docker-compose down && docker-compose up -d --build` (rebuilds both containers)
3. Server starts → `autoMigrate.js` runs idempotent schema patches → `overdueChecker.js` starts
4. Client is the built React SPA served via Nginx; API calls go to `/api` which Nginx proxies to `server:5000`

---

## 5. Backend Architecture — Entry Point

### `server/index.js`

This is the Express application bootstrap file. Every incoming HTTP request passes through it in this order:

```
Request → helmet → cors → rateLimiter → morgan → express.json → cookieParser
        → static /uploads
        → route handlers (per module)
        → global error handler
```

**Key behaviors:**
- `helmet()` — sets 11 security HTTP headers (X-Frame-Options, HSTS, CSP, etc.)
- CORS whitelist: reads `CLIENT_URL` env var, splits by comma, allows those origins + requests with no origin (server-to-server). If an origin is not allowed, `cb(null, false)` silently drops it.
- `credentials: true` — needed so browsers send the JWT cookie cross-origin
- `rateLimiter` — applied at `app.use('/api/auth', ...)` AND `app.use('/api', ...)`. Note: `/api/auth` routes hit the limiter **twice** per request (see Diagnosis section).
- `morgan('dev')` — logs HTTP method, URL, status, response time to stdout
- `express.json()` + `express.urlencoded()` — parse JSON and form bodies
- `cookieParser()` — parse `Cookie` header into `req.cookies`
- Static files at `/uploads` — served without authentication (see Security section)
- Global error handler: catches any error bubbled via `express-async-errors`, returns `{ success: false, message }` with appropriate status code

**Server startup sequence:**
```
app.listen(5000) → runAutoMigrations() → startOverdueChecker()
```

---

## 6. Middleware Layer

### `server/middleware/auth.js` — `authenticate`

Reads JWT from either `req.cookies.token` (httpOnly cookie) or `Authorization: Bearer <token>` header. Verifies against `JWT_SECRET`. Injects `req.user = { id, role, name, email }` (the JWT payload). Returns 401 if missing or invalid.

```javascript
const token = req.cookies?.token || req.headers.authorization?.split(' ')[1];
const decoded = jwt.verify(token, process.env.JWT_SECRET);
req.user = decoded;
```

All routes (except `POST /api/auth/login`) require `authenticate`.

### `server/middleware/role.js` — `authorize(...roles)`

Called **after** `authenticate`. Checks `req.user.role` against the allowed roles array. Returns 403 if the user's role is not in the list.

```javascript
const authorize = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) return res.status(403).json({ ... });
  next();
};
```

Usage pattern: `router.post('/endpoint', authorize('admin', 'manager'), handler)`

### `server/middleware/rateLimiter.js`

`express-rate-limit`: 100 requests per 15-minute window per IP. Uses standard headers (`RateLimit-*`), no legacy `X-RateLimit-*`. Applied globally to `/api` in `index.js`.

### `server/middleware/uploadValidator.js`

Post-multer file validation. Checks:
- `maxSizeBytes`: rejects files over the limit
- `allowedMimeTypes`: rejects files with disallowed MIME types

Used on file upload routes after `multer` middleware runs. Responds 400 if validation fails.

---

## 7. Database Configuration & Connection Pool

### `server/config/db.js`

Uses `pg.Pool` with these settings:
- `max: 20` connections in pool
- `idleTimeoutMillis: 30000` — idle connections closed after 30s
- `connectionTimeoutMillis: 2000` — connection attempt timeout

Exports two things:
- `query(text, params)` — thin wrapper for `pool.query(text, params)` (parameterized queries)
- `pool` — raw pool object, used in modules that need transactions via `pool.connect()` → `client.BEGIN/COMMIT/ROLLBACK`

**Transaction pattern used throughout the codebase:**
```javascript
const client = await db.pool.connect();
try {
  await client.query('BEGIN');
  // ... multiple queries
  await client.query('COMMIT');
} catch (err) {
  await client.query('ROLLBACK');
  throw err;
} finally {
  client.release();  // Always release back to pool
}
```

**Query pattern (parameterized, SQL-injection safe):**
```javascript
db.query('SELECT * FROM users WHERE id = $1', [userId])
```

---

## 8. Auto-Migration System

### `server/db/autoMigrate.js`

Runs **every time the server starts** (called in `index.js` after `app.listen`). All operations use `IF NOT EXISTS` or `DROP CONSTRAINT IF EXISTS` so they are **idempotent** — safe to run multiple times.

Applies:
1. Extends `project_activity_schedule` with stage-engine columns (`weight`, `assigned_to`, `attachment_url`, `phase_group`, `created_by`, `updated_by`, `created_at`, `updated_at`)
2. Replaces the `status` check constraint to include `'blocked'` (was missing from original schema)
3. Creates `stage_templates` table (if not exists)
4. Creates `stage_template_items` table (if not exists)
5. Creates `audit_logs` table (if not exists)
6. Adds `drive_link TEXT` column to `project_activity_schedule` (if not exists)
7. Creates performance indexes on `audit_logs` and `project_activity_schedule`

**Why autoMigrate vs numbered SQL files:** The numbered SQL files in `migrations/` are run by Docker's `docker-entrypoint-initdb.d` only on the **first container creation** (when the data volume is empty). For patches that need to be applied to existing live databases, `autoMigrate.js` is the mechanism — it runs on every server boot and is safe to run on databases that already have these columns/tables.

---

## 9. Backend Modules — Complete Reference

### 9.1 Auth Module (`/api/auth`)

**Routes:** `server/modules/auth/auth.routes.js`
**Controller:** `server/modules/auth/auth.controller.js`

No `authenticate` middleware on any auth route (they are public).

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/auth/login` | Public | Email+password login, sets JWT cookie |
| POST | `/api/auth/logout` | Public | Clears `token` cookie |
| GET | `/api/auth/me` | `authenticate` | Returns current user from DB |

**Login flow:**
1. Look up user by email (case-insensitive via `.toLowerCase()`)
2. Check `is_active = true` — inactive users cannot log in
3. `bcrypt.compare(password, user.password_hash)`
4. Sign JWT: `{ id, role, name, email }` with `JWT_SECRET`, expiry `JWT_EXPIRES_IN` (default 7d)
5. Set httpOnly cookie `token` — `secure: true` only in production+HTTPS, `sameSite: lax`
6. Return `{ success: true, user: { id, name, email, role } }`

**Cookie security settings:**
```javascript
{ httpOnly: true, secure: NODE_ENV==='production' && isHttpsClient, sameSite: 'lax', maxAge: 7days }
```

---

### 9.2 Users Module (`/api/users`)

**Routes:** `server/modules/users/users.routes.js`
**Controller:** `server/modules/users/users.controller.js`

All routes require `authenticate`. Role restrictions as noted.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/users` | admin, manager | List all users |
| GET | `/api/users/me` | any | Current user's own profile |
| GET | `/api/users/:id` | admin, manager | Get one user by ID |
| POST | `/api/users` | admin, manager | Create user (validates name/email/password/role) |
| PUT | `/api/users/:id` | admin, manager | Update user name/email/role |
| PATCH | `/api/users/:id/reset-password` | admin, manager | Force-reset any user's password |
| PATCH | `/api/users/me/change-password` | any | Self password change (requires current_password) |
| PATCH | `/api/users/:id/toggle` | admin | Toggle user active/inactive status |
| DELETE | `/api/users/:id` | admin | Hard delete user |
| POST | `/api/users/import` | admin, manager | Bulk import users from Excel |
| GET | `/api/users/template/download` | admin, manager | Download Excel import template |

**Important route ordering note:** `GET /api/users/me` is defined before `GET /api/users/:id` so Express matches `/me` literally, not as `:id = "me"`.

---

### 9.3 Projects Module (`/api/projects`)

**Routes:** `server/modules/projects/projects.routes.js`
**Controller:** `server/modules/projects/projects.controller.js`

This is the largest module. All routes require `authenticate`.

#### Project CRUD

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/projects` | any | List all projects (+ PO/DPR counts). Filter by `?status=` |
| GET | `/api/projects/:id` | any | Full project detail: team, contractors, POs, DPRs, checklists, snags |
| POST | `/api/projects` | admin, manager | Create project |
| PUT | `/api/projects/:id` | admin, manager | Update project fields |
| PATCH | `/api/projects/:id/status` | admin, manager | Quick status update (with audit log) |
| DELETE | `/api/projects/:id` | admin | Hard delete (blocked if linked POs exist) |

#### Team Management

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| PUT | `/api/projects/:id/team/bulk` | admin, manager | Replace entire team with new `user_ids[]` array |
| POST | `/api/projects/:id/team` | admin, manager | Add single team member |
| DELETE | `/api/projects/:id/team/:userId` | admin, manager | Remove team member |

#### Contractors

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/projects/:id/contractors` | admin, manager | Upsert contractor by trade (ON CONFLICT trade) |
| DELETE | `/api/projects/:id/contractors/:cid` | admin, manager | Remove contractor |

#### Legacy Activity Schedule (kept for compatibility)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/projects/:id/schedule` | any | List schedule items for project |
| PATCH | `/api/projects/:id/schedule/:sid` | any | Update schedule item (actual dates, status, notes) |
| POST | `/api/projects/:id/schedule/generate` | admin, manager | Generate schedule from activity templates by project_type |

#### Stage Engine (primary project progress system)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/projects/:id/stages` | any | Get stages + progress (total, completed, % weighted) |
| POST | `/api/projects/:id/stages` | admin, manager | Create a new stage |
| PUT | `/api/projects/:id/stages/:sid` | **any** | Update stage (status, dates, notes, drive_link, etc.) |
| DELETE | `/api/projects/:id/stages/:sid` | admin, manager | Delete stage |
| POST | `/api/projects/:id/stages/apply-template` | admin, manager | Apply standard or custom template |

**Critical note on stage update permissions:** `PUT /api/projects/:id/stages/:sid` has NO `authorize()` middleware — any authenticated user (including employees/field staff) can update stage fields including status, notes, and drive_link. This is intentional: field staff mark stages done and add Drive folder links.

#### Kanban Drag/Drop

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/projects/:id/advance-column` | any | Drag project card to a column: forward completes prior phases, backward resets later phases |

#### Stage Templates

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/projects/stage-templates` | any | List all custom stage templates |
| POST | `/api/projects/stage-templates` | admin, manager | Create custom template with items |
| GET | `/api/projects/stage-templates/sample` | any | Download Excel sample template file |
| POST | `/api/projects/stage-templates/import` | admin, manager | Import template from Excel/CSV |

#### Tracker & Admin

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/projects/tracker` | any | Full Kanban data: all projects enriched with stages, progress, column assignment |
| GET | `/api/projects/audit-logs` | admin, manager | Audit log list (filter by entity_type, entity_id) |
| POST | `/api/projects/import` | admin, manager | Bulk import projects from Excel |
| GET | `/api/projects/template/download` | admin, manager | Download Excel project import template |

#### Stage Engine Business Logic

**Progress calculation:** Each stage has a `weight` (default 1.0). If any stage has a non-default weight, weighted progress is used: `sum(completed_weights) / sum(all_weights) * 100`. Otherwise, simple count: `completed / total * 100`.

**Kanban column assignment (`getProjectKanbanColumn`):**
1. If project status is 'completed' → "Completed"
2. If no stages → "Not Started"
3. If any stage is `in_progress` → column of the latest `in_progress` stage (by sort_order)
4. If no in_progress → first phase (in master order) that has any non-completed stages
5. Master phase order: Furniture Layout → Estimation → 3D Design → 2D Drawings → Execution - Civil → Execution → Handover

**Drag-forward:** Completes all stages in phases BEFORE the target column. If target is "Completed", also sets `projects.status = 'completed'`.
**Drag-backward:** Resets all stages in phases AFTER the target column back to `pending`.

**Audit logging (`logAudit`):** Called after stage create/update/delete, team changes, status changes, template applications. Writes to `audit_logs` table. Non-fatal (errors are logged but don't block the response).

---

### 9.4 Purchase Orders Module (`/api/purchase-orders`)

**Routes:** `server/modules/purchase-orders/po.routes.js`
**Controller:** `server/modules/purchase-orders/po.controller.js`

All routes require `authenticate`.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/purchase-orders` | any | List POs (filter by status, project, vendor) |
| GET | `/api/purchase-orders/:id` | any | Full PO detail with line items, images, receipt |
| POST | `/api/purchase-orders` | any | Create PO (draft status) |
| PUT | `/api/purchase-orders/:id` | any | Update PO (only draft/rejected) |
| POST | `/api/purchase-orders/:id/submit` | any | Submit PO for approval (draft → submitted) |
| POST | `/api/purchase-orders/:id/approve` | admin | Approve PO (submitted → approved); triggers email |
| POST | `/api/purchase-orders/:id/reject` | admin | Reject PO (→ rejected); triggers email |
| GET | `/api/purchase-orders/:id/pdf` | any | Download PO as PDF |
| DELETE | `/api/purchase-orders/:id` | admin | Hard delete PO |
| POST | `/api/purchase-orders/:id/receipt` | any | Submit goods receipt with challan image |
| POST | `/api/purchase-orders/:id/verify-receipt` | admin | Verify/confirm goods receipt |
| GET | `/api/purchase-orders/:id/receipt-pdf` | any | Download receipt summary PDF |
| POST | `/api/purchase-orders/line-items/:id/images` | any | Upload image(s) to a line item |
| GET | `/api/purchase-orders/vendors-by-category` | any | Vendors filtered by element category |
| GET | `/api/purchase-orders/elements-by-category` | any | Elements filtered by vendor category |

**PO Status Machine:**
```
draft → submitted → approved → (receipt_submitted=true) → verified
      ↗ rejected ←
```
- Approval/rejection: triggers nodemailer email to PO creator
- Goods receipt: `receipt_submitted = true`, stores challan image path
- Receipt verification: `receipt_verified = true`, `receipt_verified_at`, `receipt_verified_by`

---

### 9.5 Vendors Module (`/api/vendors`)

All routes require `authenticate`.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/vendors` | any | List vendors (filter by is_active, category) |
| GET | `/api/vendors/:id` | any | Vendor detail |
| POST | `/api/vendors` | admin, manager | Create vendor |
| PUT | `/api/vendors/:id` | admin, manager | Update vendor |
| DELETE | `/api/vendors/:id` | admin | Delete vendor |
| POST | `/api/vendors/import` | admin, manager | Bulk import from Excel |
| GET | `/api/vendors/template/download` | admin, manager | Download Excel template |

---

### 9.6 Categories Module (`/api/categories`)

All routes require `authenticate`.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/categories` | any | List all categories |
| POST | `/api/categories` | admin | Create category |
| PUT | `/api/categories/:id` | admin | Update category |
| DELETE | `/api/categories/:id` | admin | Delete category |

---

### 9.7 Elements Module (`/api/elements`)

All routes require `authenticate`.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/elements` | any | List elements (filter by category_id, search) |
| GET | `/api/elements/:id` | any | Element detail |
| POST | `/api/elements` | admin, manager | Create element |
| PUT | `/api/elements/:id` | admin, manager | Update element |
| DELETE | `/api/elements/:id` | admin | Delete element |
| POST | `/api/elements/import` | admin, manager | Bulk import from Excel |
| GET | `/api/elements/template/download` | admin, manager | Download Excel template |

---

### 9.8 DPR Module (`/api/dpr`)

All routes require `authenticate`. Controller is inline in routes file.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/dpr` | any | List DPRs. Employees see only their own. |
| GET | `/api/dpr/:id` | any | DPR detail with images and voice notes |
| POST | `/api/dpr` | any | Submit DPR with up to 10 images + 3 voice notes (20MB each) |
| DELETE | `/api/dpr/:id` | admin | Delete DPR (cascades images + voice notes) |

**File storage:** Images → `server/uploads/dpr-images/`, Voice → `server/uploads/dpr-voice/`. Random UUID filenames.
**Employee scope:** `GET /api/dpr` automatically filters by `submitted_by = req.user.id` for role 'employee'.

---

### 9.9 Checklist Module (`/api/checklist`)

All routes require `authenticate`. Controller is inline in routes file.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/checklist/templates` | any | List all checklist templates |
| GET | `/api/checklist/templates/:id` | any | Template detail with items |
| POST | `/api/checklist/templates` | admin | Create template |
| GET | `/api/checklist/project/:projectId` | any | Get all checklists for a project (with items) |
| POST | `/api/checklist/project/:projectId/assign` | admin, manager | Assign template to project (creates instance) |
| PATCH | `/api/checklist/items/:itemId` | any | Mark checklist item complete/incomplete |

---

### 9.10 Snag List Module (`/api/snaglist`)

All routes require `authenticate`. Controller is inline.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/snaglist` | any | List snags. Employees see only their own. |
| GET | `/api/snaglist/:id` | any | Snag detail with images and files |
| POST | `/api/snaglist` | any | Create snag with up to 10 images + 5 files |
| PATCH | `/api/snaglist/:id` | admin, manager | Update snag (status, admin_note, vendor, dates) |
| DELETE | `/api/snaglist/:id` | admin | Hard delete snag |

**File types allowed:** JPEG, PNG, WebP, GIF, PDF, DOC/DOCX, XLS/XLSX. Max 20MB per file.
**Employee scope:** `GET /api/snaglist` filters by `reported_by = req.user.id` for employees.

---

### 9.11 Invoices Module (`/api/invoices`)

All routes require `authenticate`.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/invoices` | any | List invoices (with file attachments) |
| POST | `/api/invoices` | any | Create invoice with up to 20 files (30MB each) |
| PUT | `/api/invoices/:id` | admin | Update invoice status |
| DELETE | `/api/invoices/:id` | admin | Hard delete invoice |
| POST | `/api/invoices/:id/files` | any | Add more files to existing invoice |
| DELETE | `/api/invoices/files/:fileId` | admin | Delete a single invoice file |

**File storage:** `server/uploads/invoices/`. No MIME restriction — `uploadValidator` is called with only `maxSizeBytes: 30MB`.

---

### 9.12 Notifications Module (`/api/notifications`)

All routes require `authenticate`. Controller is inline.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/notifications` | any | Last 50 notifications for current user (with PO + project name) |
| GET | `/api/notifications/unread-count` | any | Unread notification count for current user |
| PATCH | `/api/notifications/:id/read` | any | Mark one notification as read (user_id check prevents cross-user) |
| PATCH | `/api/notifications/read-all` | any | Mark all current user's notifications as read |
| POST | `/api/notifications/check-overdue` | admin | Manual trigger: run overdue receipt check |

**Notification types:** `receipt_overdue` (day 8+, notifies creator + all admins), `receipt_reminder` (day 6-7, notifies creator only).
**Route ordering note:** `PATCH /read-all` comes after `PATCH /:id/read` in source, but `/:id/read` requires TWO path segments so there is no conflict. Express will correctly match `/read-all` because it doesn't match `/:id/read`'s two-segment pattern.

---

### 9.13 Activity Schedule Module (`/api/activity-schedule`)

All routes require `authenticate`. Templates are read-only for non-admins.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/activity-schedule/templates` | any | List activity templates (filter by `?project_type=`) |
| GET | `/api/activity-schedule/project-types` | any | Static list of all project types |

**Note:** The 45 activity schedule templates (from ABJ Combined Activity Schedule Excel) are seeded in `002_seed.sql`. They cover 15 project types (2BHK through >6BHK Bungalow, Commercial) with phases: Furniture Layout, Estimation, 3D Design, 2D Drawings, Execution - Civil, Execution.

---

### 9.14 Utility Files

**`server/utils/email.js`** — Nodemailer transporter using Gmail SMTP with app password. Functions: `sendPOApprovalEmail(po, toEmail)`, `sendPORejectionEmail(po, toEmail, reason)`. Called from PO controller on approve/reject.

**`server/utils/overdueChecker.js`** — `startOverdueChecker()` uses `setInterval` (every few hours) to query for approved POs where `receipt_submitted = false` and `approved_at < NOW() - INTERVAL '8 days'`. Creates `receipt_overdue` notifications. Also checks 6-day window for `receipt_reminder`. Started from `index.js` after `autoMigrate` completes.

**`server/utils/pdf.js`** — Uses `pdfkit` to generate PDFs. `generatePOPdf(po, res)` streams a formatted PO PDF directly to the HTTP response. `generateReceiptPdf(po, res)` generates the goods receipt summary PDF. Includes company letterhead, line item tables, GST breakdown, signatures section.

**`server/utils/validate.js`** — Reads `validationResult(req)` from `express-validator`. If errors exist, returns `400 { success: false, message, errors }`.

---

## 10. Frontend Architecture

### 10.1 Application Bootstrap (`client/src/main.jsx`)

```javascript
// BrowserRouter → QueryClientProvider → App
ReactDOM.render(
  <BrowserRouter>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </BrowserRouter>
)
```

`QueryClient` is configured with default staleTime and retry settings (see `main.jsx` for exact config).

### 10.2 HTTP Client (`client/src/lib/api.js`)

Axios instance with:
- `baseURL: import.meta.env.VITE_API_URL || '/api'` — In production Docker build, `VITE_API_URL=/api` (relative) so Nginx handles routing. In local dev, Vite's proxy config forwards `/api` to `localhost:5000`.
- `withCredentials: true` — Sends the JWT cookie on every request
- Response interceptor: If status is 401 and not on `/login`, redirect to `/login` (automatic session expiry handling)

All API calls in the app use this instance: `api.get(...)`, `api.post(...)`, etc.

### 10.3 Auth Store (`client/src/store/authStore.js`)

Zustand store with:
- `user` state: `null` or `{ id, name, email, role }`
- `login(credentials)` — calls `POST /api/auth/login`, sets `user`
- `logout()` — calls `POST /api/auth/logout`, clears `user`
- `fetchMe()` — calls `GET /api/auth/me`, sets `user` (called in `App.jsx` `useEffect` on mount to rehydrate session)

Used throughout app via `const { user } = useAuthStore()`. Role-based UI logic is done via `user?.role` checks.

### 10.4 Protected Route (`client/src/components/layout/ProtectedRoute.jsx`)

Checks `useAuthStore()`. If user is null AND loading is done, redirects to `/login`. Wraps all authenticated routes in `App.jsx`.

### 10.5 App Routing (`client/src/App.jsx`)

Route tree:
```
/login                    → LoginPage (public)
/                         → ProtectedRoute → AppLayout
  /dashboard              → DashboardPage
  /projects               → ProjectsPage
  /projects/new           → ProjectFormPage
  /projects/:id           → ProjectDetailPage
  /projects/:id/edit      → ProjectFormPage
  /purchase-orders        → POListPage
  /purchase-orders/new    → POFormPage
  /purchase-orders/:id    → PODetailPage
  /purchase-orders/:id/edit → POFormPage
  /vendors                → VendorsPage
  /vendors/new            → VendorFormPage
  /vendors/:id/edit       → VendorFormPage
  /elements               → ElementsPage
  /categories             → CategoriesPage
  /dpr                    → DPRListPage
  /dpr/new                → DPRFormPage
  /dpr/:id                → DPRDetailPage
  /invoices               → InvoicesPage
  /project-tracker        → ProjectTrackerPage
  /checklist              → ChecklistPage
  /snaglist               → SnaglistPage
  /users                  → UsersPage
  /notifications          → NotificationsPage
  /profile                → ProfilePage
  *                       → Navigate to /dashboard
```

### 10.6 App Layout (`client/src/components/layout/AppLayout.jsx`)

Renders the persistent shell around all authenticated pages:
- **Sidebar** (fixed left, mobile: drawer): Navigation links filtered by `user.role`, user name/role display, Profile + Logout buttons
- **Topbar** (sticky top): Hamburger menu (mobile), Bell icon with unread count badge (polls every 60s via `GET /api/notifications/unread-count`)
- **Main content area**: `<Outlet />` renders the active page component

**Nav item visibility by role:**
- admin: all items
- manager: all except Categories
- employee: Dashboard, Projects, POs, Vendors, DPR, Project Tracker, Snag List, Invoices

### 10.7 Shared Components (`client/src/components/shared/index.jsx`)

Reusable primitives used throughout:
- `Button` — variant: default/outline/ghost, size: sm/md/lg
- `Input` — controlled input with Tailwind styling
- `Select` — styled select dropdown
- `Textarea` — styled textarea
- `Label` — form label
- `Badge` — status/tag pill
- `Modal` — full-screen overlay with close button, title, scrollable body
- `Spinner` — loading spinner

### 10.8 Pages Reference

**DashboardPage** — Summary cards (total projects, active POs, open snags, pending receipts). Quick links. Uses `React Query` to fetch from `/api/projects`, `/api/purchase-orders`, `/api/snaglist`.

**ProjectsPage** — List of all projects with search, status filter, bulk import modal. Admin/manager: "New Project" button. Uses `GET /api/projects`.

**ProjectDetailPage** — Tabbed view:
- **Overview**: client info, location, dates, remarks, project scope. Team members card with avatar initials + role badge.
- **Stages**: `StagesTab` component — phase groups, stage rows, progress bar, drive links, status pills
- **Purchase Orders**: linked POs for this project
- **DPR**: last 10 DPRs
- **Snags**: open/resolved snags
- **Team**: team members management (add/remove, admin/manager only)

**StagesTab** — The stage engine UI. Groups stages by phase (master order). Each phase has: collapse/expand, phase progress bar, "All Done" button (admin/manager only). Each stage row: circle checkbox, stage name, status pills (any user), drive link (any user), edit/delete (admin/manager only).

**ProjectTrackerPage** — Kanban board (7 columns: Furniture Layout → Execution → Handover) + Table view toggle. Filters: status, project_type, location, services_taken, team_member. HTML5 drag/drop between columns. Backward drag shows confirmation modal. Data from `GET /api/projects/tracker`.

**PODetailPage** — PO detail: line items table, challan image, approval history. Actions vary by role:
- Any user: submit, download PDF, submit goods receipt
- Admin: approve, reject, verify receipt

**VendorFormPage** — Create/edit vendor with all fields including bank details, GST, PAN.

**ChecklistPage** — Admin creates templates. Any authenticated user marks items complete. Assign template to project (admin/manager).

**SnaglistPage** — Any user creates snags with images/files. Admin/manager updates status/vendor/dates. Admin deletes.

**InvoicesPage** — Any user creates invoices with file attachments. Admin updates status.

**NotificationsPage** — List of notifications for current user. Mark individual or all as read. Links to related PO.

**ProfilePage** — View own profile (name, email, role). Self-service password change.

**UsersPage** — Admin/manager: view, create, edit, deactivate/activate, bulk import users. Admin only: delete, toggle active.

---

## 11. Database Schema — All Tables

Tables created in `001_init.sql`, extended in patches `003` through `010`, and runtime-patched by `autoMigrate.js`.

### `users`
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | gen_random_uuid() |
| name | VARCHAR(100) | NOT NULL |
| email | VARCHAR(150) | UNIQUE NOT NULL |
| password_hash | TEXT | bcryptjs hash |
| role | VARCHAR(20) | CHECK: admin/manager/employee |
| is_active | BOOLEAN | DEFAULT true |
| created_at | TIMESTAMPTZ | DEFAULT NOW() |

### `vendors`
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| name | VARCHAR(150) | NOT NULL |
| contact_person, phone, email, address, category | various | Optional |
| gstin, pan | VARCHAR | Tax IDs |
| bank_account_holder, bank_account_number, bank_ifsc, bank_name | various | Bank details |
| is_active | BOOLEAN | DEFAULT true |
| created_by | UUID → users.id | |
| created_at | TIMESTAMPTZ | |

### `categories`
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| name | VARCHAR(100) | UNIQUE NOT NULL |
| is_active | BOOLEAN | |
| created_by | UUID → users.id | |
| created_at | TIMESTAMPTZ | |

### `elements`
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| name | VARCHAR(200) | NOT NULL |
| description | TEXT | |
| category_id | UUID → categories.id | |
| default_unit | VARCHAR(50) | e.g., sqft, nos, rft |
| gst_percent | NUMERIC(5,2) | DEFAULT 0 |
| brand_make | VARCHAR(150) | |
| is_active | BOOLEAN | |
| created_by | UUID → users.id | |
| created_at | TIMESTAMPTZ | |

### `projects`
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| name | VARCHAR(200) | NOT NULL |
| code | VARCHAR(50) | UNIQUE NOT NULL |
| client_name | VARCHAR(150) | |
| site_address | TEXT | |
| location | VARCHAR(150) | |
| status | VARCHAR(20) | CHECK: active/completed/template |
| project_type | VARCHAR(30) | CHECK: 2BHK/3BHK/.../Commercial |
| services_taken | VARCHAR(50) | CHECK: Turnkey/Project M./Design Consultancy/PM |
| team_lead_3d, team_lead_2d | VARCHAR(100) | Name strings (not FK) |
| remarks, project_scope | TEXT | |
| start_date, end_date | DATE | |
| created_by | UUID → users.id | |
| created_at | TIMESTAMPTZ | |

### `project_team`
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| project_id | UUID → projects.id | ON DELETE CASCADE |
| user_id | UUID → users.id | ON DELETE CASCADE |
| UNIQUE(project_id, user_id) | | |

### `project_contractors`
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| project_id | UUID → projects.id | |
| trade | VARCHAR(100) | ON CONFLICT updates |
| contractor_name | VARCHAR(150) | |
| vendor_id | UUID → vendors.id | Optional |
| notes | TEXT | |
| UNIQUE(project_id, trade) | | |

### `project_activity_schedule` (Stage Engine)
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| project_id | UUID → projects.id | |
| template_id | UUID → activity_schedule_templates.id | Optional |
| activity_no | VARCHAR(20) | From template |
| milestone_name | VARCHAR(300) | Stage title |
| phase | VARCHAR(100) | e.g., "3D Design", "Execution" |
| phase_group | VARCHAR(100) | Alias for phase (same field) |
| step_number | INT | |
| duration_days | INT | Planned duration |
| dependency_condition | TEXT | From template |
| sort_order | INT | Display order |
| status | VARCHAR(20) | CHECK: pending/in_progress/completed/delayed/blocked |
| weight | NUMERIC(5,2) | DEFAULT 1 (for weighted progress) |
| planned_start_date | DATE | |
| planned_end_date | DATE | |
| actual_start_date | DATE | |
| actual_end_date | DATE | |
| assigned_to | UUID → users.id | Assigned team member |
| notes | TEXT | |
| attachment_url | TEXT | File attachment URL |
| drive_link | TEXT | Google Drive folder URL |
| completed_by | UUID → users.id | Auto-set when status → completed |
| created_by | UUID → users.id | |
| updated_by | UUID → users.id | Auto-set on every PUT |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | Updated on every PUT |

### `stage_templates`
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| name | VARCHAR(200) | NOT NULL |
| description | TEXT | |
| project_type | VARCHAR(50) | |
| created_by | UUID → users.id | |
| created_at | TIMESTAMPTZ | |

### `stage_template_items`
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| template_id | UUID → stage_templates.id | ON DELETE CASCADE |
| title | VARCHAR(300) | NOT NULL |
| phase_group | VARCHAR(100) | |
| sort_order | INT | |
| weight | NUMERIC(5,2) | DEFAULT 1 |
| duration_days | INT | DEFAULT 0 |

### `audit_logs`
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| user_id | UUID → users.id | |
| user_name | VARCHAR(100) | Denormalized for speed |
| action | VARCHAR(100) | e.g., STAGE_UPDATED, TEAM_UPDATED |
| entity_type | VARCHAR(50) | e.g., 'stage', 'project' |
| entity_id | UUID | ID of affected entity |
| old_data | JSONB | Snapshot before change |
| new_data | JSONB | Snapshot after change |
| notes | TEXT | |
| created_at | TIMESTAMPTZ | Indexed DESC |

### `purchase_orders`
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| po_number | VARCHAR | Unique, auto-generated |
| project_id | UUID → projects.id | |
| vendor_id | UUID → vendors.id | |
| status | VARCHAR | draft/submitted/approved/rejected |
| total | NUMERIC | Auto-calculated from line items |
| notes | TEXT | |
| created_by | UUID → users.id | |
| approved_by | UUID → users.id | |
| approved_at | TIMESTAMPTZ | |
| rejection_reason | TEXT | |
| receipt_submitted | BOOLEAN | DEFAULT false |
| receipt_at | TIMESTAMPTZ | |
| receipt_challan_url | TEXT | Uploaded challan image path |
| receipt_verified | BOOLEAN | DEFAULT false |
| receipt_verified_at | TIMESTAMPTZ | |
| receipt_verified_by | UUID → users.id | |
| created_at, updated_at | TIMESTAMPTZ | |

### `po_line_items`
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| po_id | UUID → purchase_orders.id | ON DELETE CASCADE |
| element_id | UUID → elements.id | |
| description | TEXT | |
| qty | NUMERIC | |
| unit | VARCHAR | |
| unit_price | NUMERIC | |
| gst_percent | NUMERIC | |
| total | NUMERIC | Calculated: qty * unit_price * (1 + gst/100) |

### `po_line_item_images`
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| line_item_id | UUID → po_line_items.id | ON DELETE CASCADE |
| file_url | TEXT | Path to uploaded image |
| uploaded_at | TIMESTAMPTZ | |

### `dprs`
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| project_id | UUID → projects.id | |
| submitted_by | UUID → users.id | |
| report_date | DATE | |
| work_description | TEXT | |
| progress_summary, work_completed, issues_faced, material_used | TEXT | |
| status | VARCHAR | submitted/reviewed |
| created_at | TIMESTAMPTZ | |

### `dpr_images`
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| dpr_id | UUID → dprs.id | ON DELETE CASCADE |
| file_url | TEXT | Path |
| file_name | VARCHAR | Original filename |

### `dpr_voice_notes`
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| dpr_id | UUID → dprs.id | ON DELETE CASCADE |
| file_url | TEXT | |
| file_name | VARCHAR | |

### `snags`
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| project_id | UUID → projects.id | |
| reported_by | UUID → users.id | |
| area, item_name | VARCHAR | Location and item description |
| description, designer_name | TEXT/VARCHAR | |
| status | VARCHAR | open/in_progress/resolved |
| admin_note | TEXT | Admin response |
| vendor_id | UUID → vendors.id | Assigned vendor |
| date_of_confirmation, date_of_material_supply | DATE | |
| resolved_by | UUID → users.id | |
| resolved_at | TIMESTAMPTZ | |
| created_at | TIMESTAMPTZ | |

### `snag_images`, `snag_files`
Linked to `snags.id` ON DELETE CASCADE. Store `file_url`, `file_name` (and for files: `file_type`, `file_size`).

### `checklist_templates`, `checklist_template_items`
Template definition. Items have `task_name`, `sort_order`.

### `project_checklists`, `project_checklist_items`
Instance of a template assigned to a project. Items track `is_completed`, `completed_by`, `completed_at`.

### `invoices`
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| project_id | UUID → projects.id | Optional |
| vendor_id | UUID → vendors.id | Optional |
| invoice_number | VARCHAR | |
| invoice_date | DATE | |
| amount | NUMERIC | |
| status | VARCHAR | pending/paid/overdue |
| notes | TEXT | |
| created_by | UUID → users.id | |
| created_at | TIMESTAMPTZ | |

### `invoice_files`
Linked to `invoices.id`. Stores uploaded PDF/image paths.

### `notifications`
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| user_id | UUID → users.id | Recipient |
| type | VARCHAR | receipt_overdue / receipt_reminder |
| title | TEXT | Short notification title |
| body | TEXT | Full message |
| po_id | UUID → purchase_orders.id | Optional link |
| is_read | BOOLEAN | DEFAULT false |
| created_at | TIMESTAMPTZ | |

### `activity_schedule_templates`
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| project_type | VARCHAR | e.g., '3BHK', '4BHK_Bungalow' |
| activity_no | VARCHAR | e.g., '1.1', '2.3' |
| milestone_name | VARCHAR | Stage title |
| phase | VARCHAR | Furniture Layout / Estimation / 3D Design / 2D Drawings / Execution - Civil / Execution |
| step_number | INT | Sequence within project type |
| duration_days | INT | Standard duration |
| dependency_condition | TEXT | Description of dependencies |
| is_active | BOOLEAN | DEFAULT true |
| created_at | TIMESTAMPTZ | |

Seeded with 45 records across 15 project types from the ABJ Combined Activity Schedule Excel.

---

## 12. Complete API Endpoint Reference

### Summary Table

| Module | Base Path | Total Endpoints | Open to All Auth | Admin/Manager Only | Admin Only |
|--------|-----------|-----------------|------------------|-------------------|------------|
| Auth | `/api/auth` | 3 | 1 (login, logout) | — | — |
| Users | `/api/users` | 10 | 2 (me, change-pw) | 6 | 2 |
| Projects | `/api/projects` | 22 | 8 | 11 | 3 |
| POs | `/api/purchase-orders` | 12 | 8 | — | 4 |
| Vendors | `/api/vendors` | 7 | 2 | 3 | 1 |
| Categories | `/api/categories` | 4 | 1 | — | 3 |
| Elements | `/api/elements` | 7 | 2 | 3 | 1 |
| DPR | `/api/dpr` | 4 | 3 | — | 1 |
| Checklist | `/api/checklist` | 6 | 4 | 2 | 1 |
| Snaglist | `/api/snaglist` | 5 | 3 | 1 | 1 |
| Invoices | `/api/invoices` | 6 | 3 | — | 2 |
| Notifications | `/api/notifications` | 5 | 4 | — | 1 |
| Activity Schedule | `/api/activity-schedule` | 2 | 2 | — | — |
| Health | `/api/health` | 1 | 1 | — | — |

**Total: ~94 API endpoints.**

---

## 13. Authentication & Authorization Flow

### Login (Cookie-based)

```
Browser → POST /api/auth/login { email, password }
        → auth.controller.login
        → bcrypt.compare password
        → jwt.sign({ id, role, name, email }, JWT_SECRET, { expiresIn: '7d' })
        → res.cookie('token', jwt, { httpOnly: true, sameSite: 'lax', secure: prod+https })
        → 200 { success: true, user: { id, name, email, role } }
Browser stores cookie (httpOnly, not accessible to JS)
```

### Every Authenticated Request

```
Browser → GET/POST /api/... (Cookie header: token=<jwt>)
        → authenticate middleware
        → jwt.verify(token, JWT_SECRET)
        → req.user = { id, role, name, email }
        → [if authorize() present]: check req.user.role in allowed list
        → route handler
```

### Session Expiry

When any API call returns 401, the Axios interceptor in `api.js` redirects to `/login`. On app mount, `App.jsx` calls `fetchMe()` which hits `GET /api/auth/me` — if expired/invalid cookie, returns 401, Zustand clears user, ProtectedRoute redirects to login.

### Role Hierarchy

```
admin    → access everything
manager  → most write operations, cannot delete, cannot manage users (except create/edit)
employee → read-only on most resources, can create DPRs/snags/POs, mark stages/checklists, add drive links
```

**Specific employee permissions:**
- Can CREATE: POs (draft), DPRs, Snags, Invoices
- Can UPDATE: Stage status/notes/drive_link (any stage), Checklist items
- Can READ: Everything except audit logs, user management
- Cannot CREATE/DELETE: Projects, Vendors, Elements, Templates
- Cannot APPROVE/REJECT: POs

---

## 14. Key Business Flows

### 14.1 Purchase Order Lifecycle

```
1. Employee/Manager creates PO (POST /api/purchase-orders)
   → status: 'draft', assigned to project + vendor, line items added

2. Creator submits PO (POST /api/purchase-orders/:id/submit)
   → status: 'submitted'

3. Admin approves (POST /api/purchase-orders/:id/approve)
   → status: 'approved', approved_by/at set
   → email sent to creator via nodemailer

   OR Admin rejects (POST /api/purchase-orders/:id/reject { reason })
   → status: 'rejected', rejection_reason set
   → email sent to creator

4. Any user submits goods receipt (POST /api/purchase-orders/:id/receipt)
   → receipt_submitted = true, challan image uploaded
   → Overdue checker timer resets for this PO

5. Admin verifies receipt (POST /api/purchase-orders/:id/verify-receipt)
   → receipt_verified = true, receipt_verified_at/by set

6. Overdue notifications (automatic via overdueChecker.js):
   → Day 6 after approval: reminder notification to creator
   → Day 8+ after approval: overdue alert to creator + all admins
```

### 14.2 Project Stage Lifecycle

```
1. Admin/Manager creates project (POST /api/projects)
2. Admin/Manager applies template or adds stages manually
   (POST /api/projects/:id/stages/apply-template OR POST /api/projects/:id/stages)
3. Team members assigned (PUT /api/projects/:id/team/bulk)
4. Anyone marks stages in_progress / completed via status pills or circle checkbox
   (PUT /api/projects/:id/stages/:sid { status: 'completed' })
5. Anyone adds Google Drive folder link to a stage
   (PUT /api/projects/:id/stages/:sid { drive_link: 'https://drive.google.com/...' })
6. Admin/Manager edits stage details, adds/removes stages
7. Progress auto-calculated on every GET /api/projects/:id/stages
8. Admin/Manager drags Kanban card → advance-column API bulk-completes/resets phases
9. On all stages completed: project moves to 'Completed' column
```

### 14.3 Daily Progress Report Flow

```
1. Any user visits /dpr/new
2. Selects project, date, fills work description + optional images + voice notes
3. POST /api/dpr (multipart/form-data with images[] and voice[] fields)
4. Server: saves DPR record, uploads files to uploads/dpr-images/ and uploads/dpr-voice/
5. DPR viewable by creator (employee) or all users (admin/manager)
```

### 14.4 Notification Flow

```
overdueChecker.js (runs every N hours):
  → Queries POs: approved + receipt_submitted=false + approved_at < NOW()-8days
  → For each overdue PO:
      → Finds all admin users + PO creator
      → Checks: no notification in last 24h for this PO+user
      → Inserts notification row (type='receipt_overdue')
  → Same logic for 6-day reminder (creator only, type='receipt_reminder')

Frontend (every 60s):
  → GET /api/notifications/unread-count → updates Bell badge
  → User clicks Bell → /notifications page
  → GET /api/notifications → list
  → PATCH /api/notifications/:id/read OR /read-all
```

---

## 15. Frontend ↔ Backend Connection Map

### How Vite Proxy Works (Development)

`vite.config.js` has:
```javascript
proxy: { '/api': { target: 'http://localhost:5000', changeOrigin: true } }
```
So in dev, `api.get('/projects')` → `api.get('/api/projects')` → Vite proxies to `http://localhost:5000/api/projects`.

### How Nginx Routes Work (Production Docker)

The React app is served by Nginx on port 80 (mapped to 3000). Nginx config in the client Dockerfile has:
```nginx
location /api {
  proxy_pass http://server:5000;
}
location / {
  try_files $uri /index.html;
}
```
React Router handles client-side routing (SPA). All `/api` requests go to the Express server.

### React Query Key Conventions

| Query Key | Endpoint | Component |
|-----------|----------|-----------|
| `['stages', projectId]` | `GET /api/projects/:id/stages` | StagesTab |
| `['stage-templates']` | `GET /api/projects/stage-templates` | ApplyTemplateModal |
| `['notif-count']` | `GET /api/notifications/unread-count` | AppLayout |
| `['projects']` | `GET /api/projects` | ProjectsPage |
| `['project', id]` | `GET /api/projects/:id` | ProjectDetailPage |
| `['tracker']` | `GET /api/projects/tracker` | ProjectTrackerPage |

Cache invalidation via `queryClient.invalidateQueries(['stages', projectId])` after mutations.

---

## 16. Security Model & Threat Analysis

### Authentication Security
- JWT in httpOnly cookie → not accessible to JavaScript (XSS-resistant)
- `sameSite: 'lax'` → CSRF protection for cross-origin form submissions
- `secure: true` only in production + HTTPS → prevents cookie interception
- bcryptjs password hashing (not plain text or MD5)
- Token expiry: 7 days; no refresh token (re-login required after expiry)

### Authorization Security
- Role middleware is enforced at the route level, not just client-side
- Employees cannot access admin/manager routes even if they manipulate the UI
- Each user's notifications/DPRs are filtered by their user_id

### Known Security Issues (VPS Context)

1. **Unauthenticated static file access:** `app.use('/uploads', express.static(...))` serves uploaded files (DPR images, challan scans, voice notes, invoice PDFs) without checking authentication. Any person who knows or guesses a file URL can access it. On a VPS with 25 trusted internal users this is low risk, but on a public-facing URL it could expose sensitive documents.
   **Fix:** Add `authenticate` middleware before the static serve, or move to signed URLs.

2. **Double rate limiter on `/api/auth`:** In `index.js`, `app.use('/api/auth', rateLimiter)` and `app.use('/api', rateLimiter)` both apply to auth routes. The effective limit is halved for auth endpoints (50 successful requests instead of 100 per 15 min per IP).
   **Fix:** Remove the `/api/auth` specific rate limiter line; the `/api` limiter already covers it.

3. **SQL injection in `generateSchedule`:** The `generateSchedule` controller (legacy endpoint) builds a raw SQL VALUES string via template literals without parameterizing `activity_no`, `phase`, `dependency_condition` fields from the templates table. While templates are internal data (not user-direct input), this is bad practice.
   **Fix:** Use individual parameterized INSERT statements in a loop, similar to how `applyTemplate` does it.

4. **Error messages in production:** The global error handler returns `err.message` directly. Internal errors (DB errors, etc.) could expose schema details to clients. Consider filtering in production: return a generic message for 500 errors.

5. **multer temp files not cleaned up:** `multer({ dest: '/tmp/' })` used for import routes leaves files in `/tmp/` after processing. On a long-running server, this accumulates. Add `fs.unlinkSync(req.file.path)` after processing each import.

6. **No input length limits on freetext fields:** Fields like `notes`, `description`, `work_description` have no server-side max length check beyond the DB column type (TEXT = unlimited). Large payloads could affect performance.

7. **CORS allows no-origin requests:** `if (!origin) return cb(null, true)` — server-to-server requests (curl, Postman, server-side scripts) bypass CORS. On a VPS this is fine but means CORS is only a browser protection.

### Production Hardening Recommendations
- Set up Let's Encrypt HTTPS on the VPS domain
- Set `CLIENT_URL` to the exact production HTTPS URL
- Set `NODE_ENV=production` in docker-compose (already done)
- Consider adding the `/uploads` auth check for sensitive file types
- Review rate limiter threshold: 100/15min may be too restrictive for 25 users sharing an office IP during peak hours (consider raising to 500/15min or per-user limits after auth)

---

## 17. Diagnosis: Issues, Loose Ends & Recommendations

### CONFIRMED ISSUES

#### Issue 1: Double Rate Limiter (Low Severity)
**File:** `server/index.js` lines 26-27
**Problem:** `/api/auth` gets rate limited twice per request (matched by both `/api/auth` and `/api` limiters). Effective limit for auth routes is 50 req/15min instead of 100.
**Fix:** Remove line 26 (`app.use('/api/auth', rateLimiter)`).

#### Issue 2: SQL Injection in generateSchedule (Medium Severity)
**File:** `server/modules/projects/projects.controller.js` lines 116-122
**Problem:** Template strings are used to build SQL VALUES without parameterization for `activity_no`, `phase`, `dependency_condition`, `step_number`, `duration_days` fields.
```javascript
// CURRENT — vulnerable pattern:
const values = templates.map((t, i) =>
  `('${req.params.id}','${t.id}','${t.activity_no}','${t.milestone_name.replace(/'/g,"''")}','${t.phase}',...)`
).join(',');
```
**Risk:** Data in `activity_schedule_templates` could be manipulated to inject SQL. Source is internal DB (low direct risk), but violates defense-in-depth.
**Fix:** Use individual `INSERT` with parameterized `$1, $2...` in a loop (already the pattern in `applyTemplate`).

#### Issue 3: Unauthenticated File Serving (Medium Severity for Public URLs)
**File:** `server/index.js` line 33
**Problem:** `app.use('/uploads', express.static(...))` serves ALL uploaded files without JWT check. Challan images, DPR photos, voice notes, invoice PDFs, line item images are publicly accessible via direct URL.
**Risk:** Low for internal VPS, Medium if publicly accessible domain is used.
**Fix for higher security:** Remove static serve line, add an authenticated route: `router.get('/uploads/*', authenticate, (req, res) => { res.sendFile(path.join(uploadsDir, req.params[0])) })`

#### Issue 4: multer Temp Files Not Cleaned (Low Severity)
**Files:** `projects.routes.js`, `users.routes.js`, `vendors.routes.js` — all use `multer({ dest: '/tmp/' })` for imports
**Problem:** After processing, temp files remain in `/tmp/`.
**Fix:** Add `require('fs').unlinkSync(req.file.path)` at the end of each import handler. Or use `multer.memoryStorage()` for small import files.

#### Issue 5: drive_link Not in 010_project_stages.sql (Cosmetic)
**File:** `server/db/migrations/010_project_stages.sql`
**Problem:** The `drive_link` column is managed by `autoMigrate.js` (runtime) but not in the numbered migration. If someone runs only the numbered SQL files against a fresh DB (bypassing Docker) and never starts the server, they'll miss the column.
**Fix:** Add `ALTER TABLE project_activity_schedule ADD COLUMN IF NOT EXISTS drive_link TEXT;` to the migration file for completeness.

### NON-ISSUES (verified working)
- `GET /projects/tracker` static route before `/:id` — correct, Express matches specifics first ✅
- `PATCH /notifications/read-all` route ordering — `/:id/read` requires two segments, no conflict ✅
- `drive_link` column existence — added by `autoMigrate.js` on every server start ✅
- `module.exports.checkOverdueReceipts` on notifications route — valid JS pattern ✅
- `const checkOverdueReceipts` hoisting in route handler — used inside callback, resolved by load time ✅

### EMPTY OR STUB ENDPOINTS
None found. All registered routes have implemented controller functions. No routes return placeholder 501/200 empty responses.

### LOOSE ENDS
- `PROJECT_ANALYSIS.md` and `Project_Full_Documentation.pdf` were deleted from the working tree (visible in git status). They are documentation artifacts, not code — no impact on the app.
- `backup_before_tracker.sql` is a PostgreSQL dump file from before the Project Tracker upgrade. It shows as an untracked file in git. It is safe to delete or commit to git for archiving.
- `.claude/sessions/` files are auto-generated by Claude Code and not needed in git. Consider adding them to `.gitignore`.

### PERFORMANCE NOTES (25 users, Hostinger VPS)
- Connection pool `max: 20` — appropriate for 25 users
- Rate limiter 100/15min — may be tight if 25 users are all on the same office IP. Consider raising to 300-500 for internal use
- `getTrackerData` fetches all projects + all their stages in 2 queries — efficient with ANY($1::uuid[]) bulk query
- No pagination on project list or DPR list — acceptable for current scale, add pagination if project count exceeds 500+
- Notification bell polls every 60 seconds — fine for 25 users (25 req/min total)
- Static file serving without a CDN is fine for the current scale

---

## About `backup_before_tracker.sql`

This file is a **PostgreSQL database dump** created using `pg_dump` immediately before the Project Tracker upgrade was implemented (around 2026-04-20). It was dumped from PostgreSQL version 18.3.

**Purpose:** Rollback safety net. If the Project Tracker upgrade (migration 010, autoMigrate changes, new frontend pages) caused data loss or corruption, you could restore the database to this pre-upgrade state by running this file against a fresh PostgreSQL instance.

**Current state:** The dump appears to contain only the schema/structure without data rows (the content is minimal — just PostgreSQL headers and a `\restrict`/`\unrestrict` pair indicating an empty data dump). This suggests it was a schema-only dump or the database was newly initialized at the time of the dump.

**What to do with it:** Keep it archived as a reference point. Once the Project Tracker feature is stable in production, it can be deleted or committed to a `backups/` directory in git.

---

## About `generate_pdf.py`

This is a **Python documentation converter script** located at the project root. It reads `PROJECT_ANALYSIS.md` (this very file) and generates `Project_Full_Documentation.pdf` using the `reportlab` library.

**What it does:**
- Parses the markdown file line by line
- Renders headings (H1-H4), paragraphs, bullet lists, ordered lists, code blocks, tables, blockquotes, horizontal rules
- Generates a professional cover page with company branding (dark/navy color scheme, gold accent line)
- Adds persistent header/footer on every page (company name, "CONFIDENTIAL", page number, date)
- Outputs a print-ready A4 PDF with proper margins

**Dependencies:** `reportlab` Python library. Install with `pip install reportlab`.

**Usage:**
```bash
python generate_pdf.py
# Reads: PROJECT_ANALYSIS.md
# Writes: Project_Full_Documentation.pdf
```

**Note:** If `PROJECT_ANALYSIS.md` does not exist, the script will error. Always run from the project root directory where both files are expected to reside.
