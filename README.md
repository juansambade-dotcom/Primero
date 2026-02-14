# CloudBoard

CloudBoard is a production-ready cloud productivity app with a modern responsive UI, secure authentication, persisted task data, and deployment docs.

## Features
- Beautiful mobile/desktop UI with subtle animations.
- Secure email/password authentication (PBKDF2 + signed sessions + CSRF checks).
- SQLite persistence for users, sessions, and prioritized notes.
- REST API for CRUD operations.
- Health endpoint (`/healthz`) for cloud monitoring.
- Unit/integration tests via Python `unittest`.

## Quick start
```bash
python -m app.create_admin
python app/server.py
```
Open: `http://localhost:8000`

## Admin access (default)
- Email: `admin@cloudboard.local`
- Password: `ChangeMe12345!`

> Change credentials in production with `ADMIN_EMAIL` and `ADMIN_PASSWORD` when running `python -m app.create_admin`.

## Testing
```bash
python -m unittest discover -s tests -v
```

## API summary
- `POST /api/auth/signup`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/notes`
- `POST /api/notes`
- `PATCH /api/notes/{id}`
- `DELETE /api/notes/{id}`

## Deployment
See `docs/DEPLOYMENT.md` for environment variables and a container example.
