# 🏢 Xclusive Interiors — PO & Project Management System

A full-stack internal management platform for Purchase Orders, Projects, Vendors, DPR, Checklist, and Snag List — built for Xclusive Interiors Pvt. Ltd.

---

## 📦 Tech Stack

| Layer      | Technology                        |
|------------|-----------------------------------|
| Frontend   | React 18 + Vite + Tailwind CSS + Shadcn/ui |
| Backend    | Node.js + Express.js              |
| Database   | PostgreSQL 15                     |
| Auth       | JWT (httpOnly cookie)             |
| Email      | Nodemailer (Gmail SMTP)           |
| PDF        | Puppeteer (HTML → PDF)            |
| Storage    | Local filesystem (`/uploads`)     |
| Deploy     | Docker Compose (WLAN-ready)       |

---

## 🚀 First-Time Setup (Step by Step)

### Prerequisites

Install these on the machine that will run the server:

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (includes Docker Compose)
- Git (optional, if cloning)

---

### Step 1 — Copy environment file

```bash
cp .env.example .env
```

Open `.env` and fill in these values:

```env
DB_USER=xclusive_user
DB_PASSWORD=choose_a_strong_password
DB_NAME=xclusive_db
JWT_SECRET=any_random_string_minimum_32_characters
GMAIL_USER=your_gmail@gmail.com
GMAIL_APP_PASSWORD=your_16_char_app_password   # See below
CLIENT_URL=http://<YOUR_PC_LOCAL_IP>:3000
VITE_API_URL=http://<YOUR_PC_LOCAL_IP>:5000/api
```

> **How to get GMAIL_APP_PASSWORD:**
> 1. Enable 2-Factor Authentication on your Gmail account
> 2. Go to [Google Account → Security → App Passwords](https://myaccount.google.com/apppasswords)
> 3. Generate a new App Password for "Mail"
> 4. Copy the 16-character code into `GMAIL_APP_PASSWORD`

> **How to find YOUR_PC_LOCAL_IP:**
> - Windows: Open Command Prompt → type `ipconfig` → look for IPv4 Address (e.g. 192.168.1.105)
> - Mac/Linux: Open Terminal → type `ifconfig` or `ip a`

---

### Step 2 — Start the system

```bash
docker compose up --build
```

This will:
- Start PostgreSQL and create the database
- Run all migrations (create 20 tables)
- Seed 1538+ elements from your Excel files
- Seed 405 activity schedule templates
- Start the backend API on port 5000
- Build and serve the frontend on port 3000

Wait for the message: `✅ Server running on port 5000`

---

### Step 3 — Access the app

| Device          | URL                                    |
|-----------------|----------------------------------------|
| Server machine  | http://localhost:3000                  |
| Any phone/laptop on same WiFi | http://192.168.x.x:3000  |

---

### Step 4 — Login

| Role    | Email                              | Password    |
|---------|------------------------------------|-------------|
| Admin   | admin@xclusiveinteriors.in         | Admin@123   |

> ⚠️ **Change the admin password immediately after first login.**

---

## 🛑 Stop / Restart

```bash
# Stop
docker compose down

# Stop and delete all data (CAREFUL)
docker compose down -v

# Restart
docker compose up
```

---

## 🔄 After Code Changes

```bash
# Rebuild only changed service
docker compose up --build server
docker compose up --build client
```

---

## 📁 Folder Structure

```
xclusive-interiors/
├── docker-compose.yml          # Main orchestration file
├── .env.example                # Copy to .env and fill values
├── .env                        # Your actual config (DO NOT commit)
│
├── server/                     # Node.js + Express backend
│   ├── index.js                # Entry point
│   ├── config/db.js            # PostgreSQL connection
│   ├── middleware/
│   │   ├── auth.js             # JWT verification
│   │   └── role.js             # Role-based access (admin/manager/employee)
│   ├── modules/
│   │   ├── auth/               # Login, logout, /me
│   │   ├── users/              # User management
│   │   ├── projects/           # Projects + team + contractors + schedule
│   │   ├── vendors/            # Vendor CRUD + bank details
│   │   ├── categories/         # Category master (admin only)
│   │   ├── elements/           # Elements master + Excel import
│   │   ├── purchase-orders/    # Full PO workflow + PDF + email
│   │   ├── dpr/                # Daily Progress Reports
│   │   ├── checklist/          # Checklist templates + project instances
│   │   ├── snaglist/           # Snag logging + admin review
│   │   └── activity-schedule/  # Project activity schedule
│   ├── utils/
│   │   ├── email.js            # Nodemailer auto-email on PO approval
│   │   ├── pdf.js              # Puppeteer PO PDF generator
│   │   └── validate.js         # express-validator helper
│   ├── db/
│   │   └── migrations/
│   │       ├── 001_init.sql    # All 20 tables
│   │       ├── 002_seed.sql    # 1538 elements + 405 activity templates
│   │       └── 003_patches.sql # Column patches
│   └── uploads/                # File storage
│       ├── dpr-images/         # DPR site photos
│       ├── dpr-voice/          # DPR voice notes
│       ├── po-pdfs/            # Generated PO PDFs
│       └── snag-images/        # Snag photos
│
└── client/                     # React + Vite frontend
    ├── src/
    │   ├── App.jsx             # Route definitions (role-based)
    │   ├── main.jsx            # Entry point
    │   ├── index.css           # Tailwind + CSS variables
    │   ├── lib/
    │   │   ├── api.js          # Axios instance (auto-redirects on 401)
    │   │   └── utils.js        # cn() utility
    │   ├── store/
    │   │   └── authStore.js    # Zustand auth state (persisted)
    │   ├── components/
    │   │   ├── layout/
    │   │   │   ├── AppLayout.jsx       # Sidebar + topbar (responsive)
    │   │   │   └── ProtectedRoute.jsx  # Auth guard
    │   │   └── shared/
    │   │       └── index.jsx   # Button, Badge, Card, Input, Modal, etc.
    │   └── pages/
    │       ├── auth/           # Login
    │       ├── dashboard/      # Metric cards + recent data
    │       ├── projects/       # List, Detail, Form
    │       ├── purchase-orders/# List, Detail (approve/reject), Form
    │       ├── vendors/        # List, Form
    │       ├── elements/       # Master list + import
    │       ├── categories/     # Admin category management
    │       ├── dpr/            # List, Form, Detail (images + audio)
    │       ├── checklist/      # Project checklist with progress
    │       ├── snaglist/       # Log snags + admin review
    │       └── users/          # User management
    ├── nginx.conf              # SPA routing + API proxy
    └── Dockerfile              # Multi-stage build
```

---

## 🔐 Roles & Permissions

| Feature                    | Employee | Manager | Admin |
|----------------------------|----------|---------|-------|
| View Dashboard             | ✅       | ✅      | ✅    |
| Create / Edit PO (draft)   | ✅       | ✅      | ✅    |
| Submit PO for approval     | ✅       | ✅      | ✅    |
| Approve / Reject PO        | ❌       | ❌      | ✅    |
| Edit PO (pending approval) | ❌       | ❌      | ✅    |
| Download approved PO PDF   | ✅       | ✅      | ✅    |
| Add / Edit Vendors         | ❌       | ✅      | ✅    |
| Add / Edit Elements        | ❌       | ✅      | ✅    |
| Manage Category Master     | ❌       | ❌      | ✅    |
| Add Users                  | ❌       | ✅      | ✅    |
| Submit DPR                 | ✅       | ✅      | ❌    |
| View all DPRs              | Own only | All     | ✅    |
| Add Snag                   | ✅       | ✅      | ❌    |
| Review / Resolve Snag      | ❌       | ✅      | ✅    |
| Import Elements (Excel)    | ❌       | ✅      | ✅    |

---

## 🔄 Purchase Order Workflow

```
Employee creates PO (Draft)
        ↓
Employee submits for approval
        ↓ (PO locked — no edits)
Admin reviews (can edit before approving)
        ↓
    ┌──────────────────┐
    ▼                  ▼
 Approve            Reject
    ↓                  ↓
PO locked         Back to Draft
Auto PDF generated
Auto email → Vendor
Employee downloads PDF
```

---

## 📧 Email Setup (Nodemailer)

When a PO is approved:
1. PDF is auto-generated
2. Email is sent to vendor automatically
3. No manual action required
4. `email_sent = true` is recorded in DB

---

## 🧾 PO PDF Format

Matches your existing Xclusive PO format:
- **Page 1:** Company header, Bill to, Vendor details, Category summary, POC details
- **Page 2:** Full Annexure with line items (Element, Description, Category, UOM, Qty, Rate, Brand/Make, GST%, Total)

---

## 📊 Seed Data (Pre-loaded)

From your uploaded Excel files:

| Dataset                | Count |
|------------------------|-------|
| Elements (all categories) | 1,538 |
| Activity schedule templates | 405 (across all project types) |
| Categories             | 5 (Carpentry, Hardware, Civil, Electrical, Plumbing Sanitary Fitting) |

---

## 🛠 Development (Without Docker)

### Backend

```bash
cd server
cp ../.env.example .env   # fill values
npm install
npm run migrate           # run SQL migrations
npm run seed              # load seed data
npm run dev               # starts with nodemon
```

### Frontend

```bash
cd client
npm install
npm run dev               # starts on http://localhost:3000
```

---

## 🆘 Common Issues

| Problem | Solution |
|---------|----------|
| "Cannot connect to DB" | Check `.env` DB_* values, ensure postgres container is running |
| "Email not sending" | Verify `GMAIL_APP_PASSWORD` is 16 chars, 2FA must be ON |
| "PDF not generating" | Puppeteer needs Chromium — already installed in Docker |
| "Mobile can't connect" | Use server's local IP not `localhost`, check firewall |
| Port already in use | Change ports in `docker-compose.yml` |

---

## 📞 Support

System built for Xclusive Interiors Pvt. Ltd.
Admin account: admin@xclusiveinteriors.in
