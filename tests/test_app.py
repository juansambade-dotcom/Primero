import json
import os
import tempfile
import threading
import time
import unittest
from http.client import HTTPConnection
from pathlib import Path

import app.server as server


class CloudBoardTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        server.DB_PATH = Path(cls.tmp.name) / "test.db"
        server.init_db()
        cls.httpd = server.ThreadingHTTPServer(("127.0.0.1", 0), server.AppHandler)
        cls.port = cls.httpd.server_port
        cls.thread = threading.Thread(target=cls.httpd.serve_forever, daemon=True)
        cls.thread.start()
        time.sleep(0.05)

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        cls.tmp.cleanup()

    def request(self, method, path, body=None, headers=None):
        conn = HTTPConnection("127.0.0.1", self.port)
        payload = json.dumps(body) if body else None
        hdrs = {"Content-Type": "application/json", **(headers or {})}
        conn.request(method, path, body=payload, headers=hdrs)
        res = conn.getresponse()
        data = res.read().decode()
        return res, data

    def test_password_hash(self):
        hashed = server.hash_password("VeryStrongPassword!")
        self.assertTrue(server.verify_password("VeryStrongPassword!", hashed))
        self.assertFalse(server.verify_password("wrong", hashed))

    def test_auth_and_notes(self):
        res, _ = self.request("POST", "/api/auth/signup", {"email": "a@b.com", "password": "LongPassword12!"})
        self.assertEqual(res.status, 200)
        cookie = res.getheader("Set-Cookie").split(";", 1)[0]
        csrf = res.getheader("X-CSRF-Token")

        res, data = self.request(
            "POST",
            "/api/notes",
            {"title": "Ship", "content": "release", "priority": "high"},
            headers={"Cookie": cookie, "X-CSRF-Token": csrf},
        )
        self.assertEqual(res.status, 201)
        created = json.loads(data)
        self.assertIn("id", created)

        res, data = self.request("GET", "/api/notes", headers={"Cookie": cookie})
        self.assertEqual(res.status, 200)
        notes = json.loads(data)["notes"]
        self.assertEqual(len(notes), 1)


if __name__ == "__main__":
    unittest.main()
