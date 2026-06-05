# TSH Safety Core Activity - AI Quick Start

## Project Overview

ระบบจัดการกิจกรรมความปลอดภัย (Safety Core Activity) สำหรับองค์กร TSH
ภาษา UI: ภาษาไทย (ข้อความ error/success ทุกอย่างเป็นภาษาไทย)

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Vanilla JS SPA, Tailwind CSS (CDN), Chart.js, Flatpickr, FullCalendar, SheetJS, html2canvas, jsPDF |
| Font | Kanit (Google Fonts) |
| Backend | Node.js + Express v5 |
| Database | Company MySQL/MariaDB via `mysql2` connection pool |
| File Storage | Local backend uploads folder (`backend/uploads`) served at `/uploads` |
| Auth | JWT (6h expiry) + bcrypt passwords |
| Deploy | Company server (Node.js backend + static frontend) |

## Project Structure Summary

- `index.html` - single HTML entry point for the SPA.
- `public/js/` - frontend router, session, API helpers, UI utilities, and page modules.
- `api/` - PHP production API compatibility layer and handlers.
- `backend/` - Node/Express local API, route parity, DB pool, upload storage, tests, and scripts.
- `uploads/` / `backend/uploads/` - uploaded files; always back up with MySQL.
- `docs/` - supplemental production readiness and runbook documents.

## Environment Variables

Config file: `backend/.env` (ไม่อยู่ใน git)

```
PORT=5000
JWT_SECRET=...
DB_HOST=...          # company MySQL/MariaDB host
DB_PORT=3306
DB_USER=...
DB_PASS=...
DB_NAME=...
PUBLIC_UPLOAD_BASE_URL=... # backend URL visible to users, e.g. http://company-server:5000
ALLOWED_ORIGINS=...        # comma-separated frontend origins
```

## Core Rules

- Documentation-only changes must not touch frontend, backend, PHP API, DB, deployment, or generated production files.
- Do not push to GitHub unless the user explicitly asks in the current task.
- Thai UTF-8 is production-critical. Scan changed files for mojibake markers after edits.
- Preserve historical handoff, smoke test, backup, deployment, and phase notes by moving them, not deleting them.
- For implementation work, read `AGENTS.md` before coding and follow its testing, migration, upload, and production rules.

## Current Handoff Summary

Current production target is the company shared hosting/PHP API path backed by Company MySQL/MariaDB and local server storage. The detailed current handoff and all phase/deploy history live in `CHANGELOG.md`. Production operation steps live in `DEPLOYMENT.md`.

Current local work: Safety Patrol Sec. & Supervisor schedule linkage is implemented locally and documented in `CHANGELOG.md`; it has not been deployed or pushed.

## Split Documentation

- `AGENTS.md` - Codex/Claude operating rules, safety checks, tests, forbidden actions, encoding, DB migration, and upload rules.
- `ARCHITECTURE.md` - frontend, PHP API, Node backend, auth/session, database, storage, module architecture, and API compatibility principles.
- `DEPLOYMENT.md` - local run, shared-hosting production target, FTP, backup, SHA-256 verification, smoke tests, rollback, and cleanup.
- `CHANGELOG.md` - dated handoff history, SU/PW/Patrol phases, Phase 4-9 migration, post-migration phases, deployment markers, and verification summaries.
- `ROADMAP.md` - remaining work, recommended next phases, technical debt, production safety improvements, and refactor opportunities.
