import base64
import hashlib
import hmac
import json
import logging
import os
import secrets
import sqlite3
import threading
import time
from datetime import datetime, timedelta, timezone
from http import HTTPStatus
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

BASE_DIR = Path(__file__).resolve().parent.parent
DB_PATH = BASE_DIR / "app.db"
STATIC_DIR = BASE_DIR / "static"

APP_NAME = "CloudBoard"
SESSION_TTL_SECONDS = 60 * 60 * 24 * 7
LOGIN_RATE_LIMIT = 10
LOGIN_RATE_WINDOW = 60
SECURE_COOKIES = os.getenv("SECURE_COOKIES", "false").lower() == "true"
SECRET_KEY = os.getenv("APP_SECRET", secrets.token_hex(32)).encode("utf-8")

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

_db_lock = threading.Lock()
_rate_limit = {}


def db_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    with _db_lock, db_conn() as conn:
        conn.executescript(
            """
            PRAGMA journal_mode=WAL;
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                token_hash TEXT UNIQUE NOT NULL,
                csrf_token TEXT NOT NULL,
                expires_at TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            );
            CREATE TABLE IF NOT EXISTS notes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                title TEXT NOT NULL,
                content TEXT NOT NULL,
                priority TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_notes_user ON notes(user_id);
            CREATE INDEX IF NOT EXISTS idx_sessions_hash ON sessions(token_hash);
            """
        )


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def hash_password(password: str, salt: bytes | None = None) -> str:
    salt = salt or secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 200000)
    return base64.b64encode(salt + digest).decode("utf-8")


def verify_password(password: str, encoded: str) -> bool:
    raw = base64.b64decode(encoded.encode("utf-8"))
    salt, digest = raw[:16], raw[16:]
    attempt = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 200000)
    return hmac.compare_digest(digest, attempt)


def sign_token(raw: str) -> str:
    return hmac.new(SECRET_KEY, raw.encode("utf-8"), hashlib.sha256).hexdigest()


def json_response(handler, payload, status=HTTPStatus.OK):
    data = json.dumps(payload).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(data)))
    handler.send_header("Cache-Control", "no-store")
    handler.end_headers()
    handler.wfile.write(data)


def html_layout(body: str, user_email: str | None = None, extra_head: str = ""):
    auth_fragment = (
        f"<div class='pill'>Signed in as {user_email}</div>"
        "<button id='logoutBtn' class='ghost'>Log out</button>"
        if user_email
        else "<a class='ghost' href='/login'>Login</a><a class='cta' href='/signup'>Create account</a>"
    )
    return f"""<!doctype html>
<html lang='en'>
<head>
  <meta charset='utf-8' />
  <meta name='viewport' content='width=device-width, initial-scale=1' />
  <title>{APP_NAME}</title>
  <link rel='stylesheet' href='/static/styles.css' />
  {extra_head}
</head>
<body>
  <header>
    <h1>{APP_NAME}</h1>
    <nav>{auth_fragment}</nav>
  </header>
  {body}
  <script src='/static/app.js'></script>
</body>
</html>
"""


def parse_cookies(handler):
    cookie = SimpleCookie()
    if handler.headers.get("Cookie"):
        cookie.load(handler.headers["Cookie"])
    return cookie


def clean_rate_limits():
    current = time.time()
    for key, attempts in list(_rate_limit.items()):
        _rate_limit[key] = [t for t in attempts if current - t < LOGIN_RATE_WINDOW]
        if not _rate_limit[key]:
            _rate_limit.pop(key, None)


def session_user(handler):
    cookie = parse_cookies(handler)
    token = cookie.get("session")
    if not token:
        return None
    token_hash = sign_token(token.value)
    with _db_lock, db_conn() as conn:
        row = conn.execute(
            """SELECT users.id, users.email, sessions.csrf_token, sessions.expires_at
               FROM sessions JOIN users ON users.id=sessions.user_id
               WHERE sessions.token_hash=?""",
            (token_hash,),
        ).fetchone()
        if not row:
            return None
        if datetime.fromisoformat(row["expires_at"]) < datetime.now(timezone.utc):
            conn.execute("DELETE FROM sessions WHERE token_hash=?", (token_hash,))
            return None
        return dict(row)


class AppHandler(BaseHTTPRequestHandler):
    server_version = "CloudBoard/1.0"

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path.startswith("/static/"):
            return self.serve_static(parsed.path.replace("/static/", ""))
        if parsed.path == "/":
            return self.serve_home()
        if parsed.path == "/login":
            return self.serve_auth("login")
        if parsed.path == "/signup":
            return self.serve_auth("signup")
        if parsed.path == "/api/notes":
            return self.handle_list_notes()
        if parsed.path == "/healthz":
            return json_response(self, {"ok": True, "time": now_iso()})
        self.send_error(HTTPStatus.NOT_FOUND, "Not found")

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/auth/signup":
            return self.handle_signup()
        if parsed.path == "/api/auth/login":
            return self.handle_login()
        if parsed.path == "/api/auth/logout":
            return self.handle_logout()
        if parsed.path == "/api/notes":
            return self.handle_create_note()
        self.send_error(HTTPStatus.NOT_FOUND, "Not found")

    def do_PATCH(self):
        parsed = urlparse(self.path)
        if parsed.path.startswith("/api/notes/"):
            return self.handle_update_note(int(parsed.path.split("/")[-1]))
        self.send_error(HTTPStatus.NOT_FOUND, "Not found")

    def do_DELETE(self):
        parsed = urlparse(self.path)
        if parsed.path.startswith("/api/notes/"):
            return self.handle_delete_note(int(parsed.path.split("/")[-1]))
        self.send_error(HTTPStatus.NOT_FOUND, "Not found")

    def parse_json(self):
        length = int(self.headers.get("Content-Length", "0"))
        body = self.rfile.read(length) if length else b"{}"
        return json.loads(body.decode("utf-8"))

    def authenticate(self, require_csrf=False):
        user = session_user(self)
        if not user:
            json_response(self, {"error": "unauthorized"}, HTTPStatus.UNAUTHORIZED)
            return None
        if require_csrf:
            csrf = self.headers.get("X-CSRF-Token")
            if not csrf or not hmac.compare_digest(csrf, user["csrf_token"]):
                json_response(self, {"error": "invalid_csrf"}, HTTPStatus.FORBIDDEN)
                return None
        return user

    def create_session(self, user_id):
        session_token = secrets.token_urlsafe(32)
        token_hash = sign_token(session_token)
        csrf_token = secrets.token_urlsafe(18)
        expires_at = datetime.now(timezone.utc) + timedelta(seconds=SESSION_TTL_SECONDS)
        with _db_lock, db_conn() as conn:
            conn.execute(
                "INSERT INTO sessions(user_id, token_hash, csrf_token, expires_at, created_at) VALUES (?, ?, ?, ?, ?)",
                (user_id, token_hash, csrf_token, expires_at.isoformat(), now_iso()),
            )
        return session_token, csrf_token

    def send_session_cookie(self, token):
        cookie = SimpleCookie()
        cookie["session"] = token
        cookie["session"]["path"] = "/"
        cookie["session"]["httponly"] = True
        cookie["session"]["samesite"] = "Lax"
        if SECURE_COOKIES:
            cookie["session"]["secure"] = True
        self.send_header("Set-Cookie", cookie.output(header="").strip())

    def clear_session_cookie(self):
        cookie = SimpleCookie()
        cookie["session"] = ""
        cookie["session"]["path"] = "/"
        cookie["session"]["expires"] = "Thu, 01 Jan 1970 00:00:00 GMT"
        cookie["session"]["httponly"] = True
        cookie["session"]["samesite"] = "Lax"
        self.send_header("Set-Cookie", cookie.output(header="").strip())

    def serve_home(self):
        user = session_user(self)
        if user:
            body = """
            <main class='dashboard'>
              <section class='hero'>
                <h2>Ship your day with confidence.</h2>
                <p>Track priorities, capture ideas, and keep momentum from any device.</p>
              </section>
              <section class='panel'>
                <form id='noteForm'>
                  <input required name='title' placeholder='Task title' maxlength='80' />
                  <textarea required name='content' placeholder='Details'></textarea>
                  <select name='priority'>
                    <option value='low'>Low</option>
                    <option value='medium' selected>Medium</option>
                    <option value='high'>High</option>
                  </select>
                  <button class='cta' type='submit'>Add task</button>
                </form>
                <div id='notes'></div>
              </section>
            </main>
            """
            page = html_layout(body, user["email"], f"<meta name='csrf' content='{user['csrf_token']}' />")
            data = page.encode("utf-8")
            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("X-CSRF-Token", user["csrf_token"])
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return

        body = """
        <main class='landing'>
          <section class='hero'>
            <h2>Cloud-native personal workspace</h2>
            <p>Securely organize priorities with encrypted passwords, signed sessions, and SQLite durability.</p>
            <div class='actions'>
              <a class='cta' href='/signup'>Start free</a>
              <a class='ghost' href='/login'>Sign in</a>
            </div>
          </section>
          <section class='cards'>
            <article><h3>Responsive</h3><p>Works beautifully across desktop and mobile.</p></article>
            <article><h3>Secure auth</h3><p>Email/password login with PBKDF2 hashing and CSRF protection.</p></article>
            <article><h3>Deployable</h3><p>Runs anywhere Python 3.11+ is available.</p></article>
          </section>
        </main>
        """
        data = html_layout(body).encode("utf-8")
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def serve_auth(self, mode):
        action = "/api/auth/login" if mode == "login" else "/api/auth/signup"
        title = "Welcome back" if mode == "login" else "Create your workspace"
        body = f"""
        <main class='auth'>
          <form id='authForm' data-action='{action}'>
            <h2>{title}</h2>
            <input required type='email' name='email' placeholder='name@company.com' />
            <input required type='password' name='password' minlength='10' placeholder='Strong password' />
            <button class='cta' type='submit'>{mode.title()}</button>
            <p id='formMsg'></p>
          </form>
        </main>
        """
        data = html_layout(body).encode("utf-8")
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def serve_static(self, relpath):
        file_path = STATIC_DIR / relpath
        if not file_path.exists() or not file_path.is_file():
            return self.send_error(HTTPStatus.NOT_FOUND)
        mime = "text/plain"
        if file_path.suffix == ".css":
            mime = "text/css"
        elif file_path.suffix == ".js":
            mime = "application/javascript"
        data = file_path.read_bytes()
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", mime)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "public, max-age=3600")
        self.end_headers()
        self.wfile.write(data)

    def handle_signup(self):
        payload = self.parse_json()
        email = payload.get("email", "").strip().lower()
        password = payload.get("password", "")
        if "@" not in email or len(password) < 10:
            return json_response(self, {"error": "invalid_input"}, HTTPStatus.BAD_REQUEST)
        pwd_hash = hash_password(password)
        try:
            with _db_lock, db_conn() as conn:
                cur = conn.execute(
                    "INSERT INTO users(email, password_hash, created_at) VALUES (?, ?, ?)",
                    (email, pwd_hash, now_iso()),
                )
                user_id = cur.lastrowid
        except sqlite3.IntegrityError:
            return json_response(self, {"error": "email_exists"}, HTTPStatus.CONFLICT)

        session_token, csrf_token = self.create_session(user_id)
        self.send_response(HTTPStatus.OK)
        self.send_session_cookie(session_token)
        data = json.dumps({"ok": True}).encode("utf-8")
        self.send_header("Content-Type", "application/json")
        self.send_header("X-CSRF-Token", csrf_token)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def handle_login(self, allow_rate_limit=True):
        clean_rate_limits()
        payload = self.parse_json()
        email = payload.get("email", "").strip().lower()
        password = payload.get("password", "")
        ip = self.client_address[0]
        key = f"{ip}:{email}"
        if allow_rate_limit and len(_rate_limit.get(key, [])) >= LOGIN_RATE_LIMIT:
            return json_response(self, {"error": "rate_limited"}, HTTPStatus.TOO_MANY_REQUESTS)

        with _db_lock, db_conn() as conn:
            user = conn.execute("SELECT * FROM users WHERE email=?", (email,)).fetchone()
            if not user or not verify_password(password, user["password_hash"]):
                _rate_limit.setdefault(key, []).append(time.time())
                return json_response(self, {"error": "invalid_credentials"}, HTTPStatus.UNAUTHORIZED)
        session_token, csrf_token = self.create_session(user["id"])

        self.send_response(HTTPStatus.OK)
        self.send_session_cookie(session_token)
        data = json.dumps({"ok": True}).encode("utf-8")
        self.send_header("Content-Type", "application/json")
        self.send_header("X-CSRF-Token", csrf_token)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def handle_logout(self):
        user = session_user(self)
        if user:
            cookie = parse_cookies(self)
            token_hash = sign_token(cookie["session"].value)
            with _db_lock, db_conn() as conn:
                conn.execute("DELETE FROM sessions WHERE token_hash=?", (token_hash,))
        self.send_response(HTTPStatus.OK)
        self.clear_session_cookie()
        data = b'{"ok": true}'
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def handle_list_notes(self):
        user = self.authenticate()
        if not user:
            return
        with _db_lock, db_conn() as conn:
            rows = conn.execute(
                "SELECT id, title, content, priority, created_at, updated_at FROM notes WHERE user_id=? ORDER BY updated_at DESC",
                (user["id"],),
            ).fetchall()
        return json_response(self, {"notes": [dict(r) for r in rows]})

    def handle_create_note(self):
        user = self.authenticate(require_csrf=True)
        if not user:
            return
        payload = self.parse_json()
        title = payload.get("title", "").strip()
        content = payload.get("content", "").strip()
        priority = payload.get("priority", "medium")
        if not title or not content or priority not in {"low", "medium", "high"}:
            return json_response(self, {"error": "invalid_input"}, HTTPStatus.BAD_REQUEST)
        with _db_lock, db_conn() as conn:
            cur = conn.execute(
                "INSERT INTO notes(user_id, title, content, priority, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
                (user["id"], title, content, priority, now_iso(), now_iso()),
            )
            note_id = cur.lastrowid
        return json_response(self, {"ok": True, "id": note_id}, HTTPStatus.CREATED)

    def handle_update_note(self, note_id):
        user = self.authenticate(require_csrf=True)
        if not user:
            return
        payload = self.parse_json()
        with _db_lock, db_conn() as conn:
            note = conn.execute("SELECT id FROM notes WHERE id=? AND user_id=?", (note_id, user["id"])).fetchone()
            if not note:
                return json_response(self, {"error": "not_found"}, HTTPStatus.NOT_FOUND)
            conn.execute(
                "UPDATE notes SET title=?, content=?, priority=?, updated_at=? WHERE id=?",
                (
                    payload.get("title", "").strip() or "Untitled",
                    payload.get("content", "").strip(),
                    payload.get("priority", "medium"),
                    now_iso(),
                    note_id,
                ),
            )
        return json_response(self, {"ok": True})

    def handle_delete_note(self, note_id):
        user = self.authenticate(require_csrf=True)
        if not user:
            return
        with _db_lock, db_conn() as conn:
            conn.execute("DELETE FROM notes WHERE id=? AND user_id=?", (note_id, user["id"]))
        return json_response(self, {"ok": True})


def run(host="0.0.0.0", port=8000):
    init_db()
    logger.info("Starting server on %s:%s", host, port)
    httpd = ThreadingHTTPServer((host, port), AppHandler)
    httpd.serve_forever()


if __name__ == "__main__":
    run(port=int(os.getenv("PORT", "8000")))
