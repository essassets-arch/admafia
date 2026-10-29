# Growthline B2B Lead Generation CRM

Project workspace with strictly separated **`frontend/`** and **`backend/`** folders connected to **PostgreSQL**.

## Folder Structure

```text
d:\admafia\
├── frontend/                  # React 19 + Vite Frontend Application (Port 5173)
│   ├── public/                # Static assets
│   ├── src/
│   │   ├── portal/            # Customer Workspace (/portal, /#login, /#register)
│   │   ├── sales/             # Sales Executive & Operations Desk (/sales)
│   │   ├── services/
│   │   │   └── crmApi.js      # PostgreSQL Backend REST API Client
│   │   ├── App.jsx            # Main router & real-time state sync
│   │   └── main.jsx           # React entry point
│   ├── .env                   # VITE_API_URL=http://localhost:5000/api
│   ├── index.html
│   ├── package.json
│   └── vite.config.js         # Proxies /api -> http://localhost:5000
│
└── backend/                   # Node.js + Express + PostgreSQL API Server (Port 5000)
    ├── db.js                  # PostgreSQL connection pool + persistent PGlite engine
    ├── initDb.js              # Database schema initializer
    ├── schema.sql             # 11 PostgreSQL tables + vw_sales_customer_accounts view
    ├── server.js              # REST API endpoints (/api/auth, /api/customers, /api/wallets, /api/leads)
    ├── .env                   # PORT=5000 & PostgreSQL credentials
    └── package.json
```

## Running with Docker (Recommended)

Start the entire stack (PostgreSQL + Express Backend + React/Vite Frontend + pgAdmin 4 Web DB) in a single command:

```bash
docker compose up -d --build
```

### Services Started:
- **Frontend SPA**: `http://localhost:5050`
- **Backend API**: `http://localhost:5000/api`
- **PostgreSQL 16**: `localhost:5432` (`admafia_crm`)
- **pgAdmin 4 Web**: `http://localhost:5055/dbadmin/browser/` (Login: `admin@admafia.marketing` / `AdMafiaAdmin2026!`)

---

## Running Locally Without Docker

### 1. Start the Backend API Server (`http://localhost:5000`)
```bash
cd backend
npm start
```

### 2. Start the Frontend Server (`http://localhost:5173`)
```bash
cd frontend
npm run dev
```
