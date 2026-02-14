import os
from app.server import db_conn, hash_password, init_db, now_iso


def main():
    email = os.getenv("ADMIN_EMAIL", "admin@cloudboard.local")
    password = os.getenv("ADMIN_PASSWORD", "ChangeMe12345!")
    init_db()
    with db_conn() as conn:
        conn.execute(
            "INSERT OR IGNORE INTO users(email, password_hash, created_at) VALUES (?, ?, ?)",
            (email, hash_password(password), now_iso()),
        )
    print(f"Admin ready: {email}")


if __name__ == "__main__":
    main()
