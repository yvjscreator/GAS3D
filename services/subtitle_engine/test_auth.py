"""Authentication and catalogue integration; no provider credentials are required."""
import hashlib
import json
import os
import time
import unittest
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from . import auth
from . import mockup_library as catalogue
from .test_mockup_library import MemoryCloud, product, photo


class AccessTests(unittest.TestCase):
    def setUp(self):
        auth._attempts.clear()
        self.password = "unit-test-password-not-a-real-secret"
        self.environment = patch.dict(os.environ, {
            "GAS3D_AUTH_ENABLED": "true", "GAS3D_AUTH_USERNAME": "owner",
            "GAS3D_AUTH_PASSWORD_HASH": auth.password_hash(self.password),
            "GAS3D_AUTH_SECRET": "unit-test-signing-secret-at-least-32-bytes",
            "MOCKUP_LIBRARY_TOKEN": "unit-test-old-catalogue-key-24-characters",
        })
        self.environment.start()
        self.addCleanup(self.environment.stop)
        self.cloud = MemoryCloud()
        self.store = catalogue.CloudLibrary()
        self.store.options = dict(cloud_name="test-cloud", api_key="fake", api_secret="fake", secure=True)
        self.store.download = self.cloud.download
        self.patches = [patch.object(catalogue, "_library", self.store),
                        patch.object(catalogue.cloudinary.uploader, "upload", self.cloud.upload),
                        patch.object(catalogue.cloudinary.uploader, "destroy", self.cloud.destroy),
                        patch.object(catalogue.cloudinary.api, "resources", self.cloud.resources)]
        for item in self.patches:
            item.start()
        self.addCleanup(lambda: [item.stop() for item in reversed(self.patches)])
        self.app = FastAPI()
        self.app.include_router(auth.router)
        self.app.include_router(catalogue.router)
        self.app.add_middleware(auth.AuthenticationGuard)
        self.app.get("/api/subtitles/private-test")(lambda: {"ok": True})
        self.app.get("/api/subtitles/health")(lambda: {"status": "ok"})
        self.client = TestClient(self.app)

    def login(self):
        response = self.client.post("/api/auth/login", json={"username": "owner", "password": self.password})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.headers["Cache-Control"], "no-store")
        return response.json()

    def test_private_api_requires_authentication_and_health_stays_available(self):
        for path in ["/api/mockups/products", "/api/subtitles/private-test"]:
            self.assertEqual(self.client.get(path).status_code, 401)
        self.assertEqual(self.client.get("/api/subtitles/health").status_code, 200)
        self.assertEqual(self.client.get("/api/mockups/health").status_code, 200)
        status = self.client.get("/api/auth/session")
        self.assertIsNone(status.json()["user"])
        self.assertNotIn("SECRET", status.text)
        self.assertEqual(status.headers["Cache-Control"], "no-store")

    def test_bad_credentials_are_generic_and_never_issue_access(self):
        for user, password in [("owner", "wrong"), ("unknown", self.password)]:
            response = self.client.post("/api/auth/login", json={"username": user, "password": password})
            self.assertEqual(response.status_code, 401)
            self.assertEqual(response.json()["detail"], "Usuario o contraseña incorrectos.")
            self.assertNotIn("token", response.json())

    def test_session_opens_and_saves_catalogue_without_provider_key(self):
        result = self.login()
        headers = {"Authorization": "Bearer " + result["token"]}
        self.assertNotIn(self.password, result["token"])
        self.assertNotIn(os.environ["MOCKUP_LIBRARY_TOKEN"], result["token"])
        config = product()
        config["views"]["front"].pop("photoName")
        config["views"]["front"]["calibration"] = {"vertical": {"cm": 70}}
        response = self.client.put("/api/mockups/products/test-product", headers=headers,
                                   data={"product": json.dumps(config), "photo_views": "[]"})
        self.assertEqual(response.status_code, 200, response.text)
        # A fresh device needs only GAS3D login, never the Cloudinary catalogue key.
        other_device = TestClient(self.app)
        session = other_device.post("/api/auth/login", json={"username": "owner", "password": self.password}).json()
        recovered = other_device.get("/api/mockups/products", headers={"Authorization": "Bearer " + session["token"]})
        self.assertEqual(recovered.status_code, 200)
        self.assertEqual(recovered.json()["records"][0]["product"], config)
        status = other_device.get("/api/auth/session", headers=headers).json()
        self.assertEqual(status["user"], "owner")
        self.assertEqual(status["expiresAt"], result["expiresAt"])
        self.assertEqual(self.client.get("/api/subtitles/private-test", headers=headers).status_code, 200)
        deleted = self.client.delete("/api/mockups/products/test-product", headers={**headers, "X-Product-Revision": response.json()["revision"]})
        self.assertEqual(deleted.status_code, 200)

    def test_session_downloads_exact_original_photo(self):
        data = b"original bytes stay unchanged"
        saved = self.store.save("test-product", product(), "", {"front": photo(data)})
        url = "/api/mockups/products/test-product/photos/front?digest=" + hashlib.sha256(data).hexdigest()
        self.assertEqual(self.client.get(url).status_code, 401)
        response = self.client.get(url, headers={"Authorization": "Bearer " + self.login()["token"]})
        self.assertEqual(response.content, data)
        self.assertEqual(saved["photos"]["front"]["hash"], hashlib.sha256(data).hexdigest())

    def test_forged_expired_and_rotated_credentials_cannot_access(self):
        session = self.login()
        for token in ["gas3d.invalid", session["token"] + "tampered", "invalid"]:
            self.assertEqual(self.client.get("/api/mockups/products", headers={"Authorization": "Bearer " + token}).status_code, 401)
        headers = {"Authorization": "Bearer " + session["token"]}
        with patch.object(auth.time, "time", return_value=time.time() + auth.SESSION_SECONDS + 1):
            self.assertEqual(self.client.get("/api/mockups/products", headers=headers).status_code, 401)
        with patch.dict(os.environ, {"GAS3D_AUTH_PASSWORD_HASH": auth.password_hash("new unit-test password")}):
            self.assertEqual(self.client.get("/api/mockups/products", headers=headers).status_code, 401)

    def test_login_attempts_are_limited(self):
        for _ in range(8):
            self.assertEqual(self.client.post("/api/auth/login", json={"username": "owner", "password": "wrong"}).status_code, 401)
        response = self.client.post("/api/auth/login", json={"username": "owner", "password": self.password})
        self.assertEqual(response.status_code, 429)
        self.assertEqual(response.headers["Retry-After"], "300")

    def test_misconfigured_auth_fails_closed(self):
        with patch.dict(os.environ, {"GAS3D_AUTH_SECRET": ""}):
            self.assertEqual(self.client.get("/api/mockups/products").status_code, 503)
            self.assertEqual(self.client.post("/api/auth/login", json={"username": "owner", "password": self.password}).status_code, 503)
            self.assertFalse(self.client.get("/api/auth/session").json()["configured"])

    def test_legacy_key_stays_limited_to_catalogue(self):
        headers = {"Authorization": "Bearer " + os.environ["MOCKUP_LIBRARY_TOKEN"]}
        self.assertEqual(self.client.get("/api/mockups/products", headers=headers).status_code, 200)
        self.assertEqual(self.client.get("/api/subtitles/private-test", headers=headers).status_code, 401)
        self.assertIsNone(self.client.get("/api/auth/session", headers=headers).json()["user"])

    def test_password_hash_has_random_salt_and_rejects_invalid_work_factors(self):
        first, second = auth.password_hash(self.password), auth.password_hash(self.password)
        self.assertNotEqual(first, second)
        self.assertNotIn(self.password, first)
        for invalid in ["plaintext", first.replace("600000", "1"), first.replace("pbkdf2_sha256", "md5")]:
            with patch.dict(os.environ, {"GAS3D_AUTH_PASSWORD_HASH": invalid}):
                self.assertFalse(auth.auth_configured())
