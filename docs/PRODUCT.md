# CloudBoard Product Plan

## Phase 1 — Product Design
- **Idea:** CloudBoard is a cloud-based productivity workspace for freelancers and small teams to track priorities.
- **Target user:** Founder/operators, project managers, and independent makers who need fast planning from mobile and desktop.
- **UX flow:**
  1. Landing page explains value.
  2. User signs up with email/password.
  3. User lands on dashboard and creates prioritized task cards.
  4. User can delete or update tasks and continue from any device.
- **Roadmap:**
  - v1: Email auth + task board + responsive design.
  - v1.1: Google/Apple OAuth integration and team sharing.
  - v1.2: Real-time collaboration and analytics.

## Phase 2 — Architecture
- **Stack:** Python 3.11, built-in `http.server`, SQLite (WAL mode), vanilla JS/CSS frontend.
- **System design:**
  - Server routes pages and REST JSON APIs.
  - Secure cookie sessions and CSRF tokens per session.
  - Notes persisted in SQLite with user ownership.
- **Schema:** `users`, `sessions`, `notes`.
- **API endpoints:**
  - `POST /api/auth/signup`
  - `POST /api/auth/login`
  - `POST /api/auth/logout`
  - `GET /api/notes`
  - `POST /api/notes`
  - `PATCH /api/notes/{id}`
  - `DELETE /api/notes/{id}`
