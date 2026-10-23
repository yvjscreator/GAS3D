"""Run with: PYTHONPATH=services python -m unittest subtitle_engine.test_mockup_library"""
import hashlib
import io
import json
import os
import unittest
from unittest.mock import patch
from urllib.error import HTTPError

from fastapi import FastAPI, HTTPException, UploadFile
from fastapi.testclient import TestClient

from . import mockup_library as module


def product(product_id="test-product"):
    return dict(id=product_id, name="Remera de prueba", type="Remera", views={
        view: dict(enabled=view == "front", zones=[], **({"photoName": "foto.png", "photoVersion": "first"} if view == "front" else {}))
        for view in module.VIEWS})


def photo(data=b"original image bytes"):
    return UploadFile(filename="foto.png", file=io.BytesIO(data))


class MemoryCloud:
    def __init__(self):
        self.assets = {}
        self.deleted = []
        self.uploaded = []
        self.fail_manifest = False
        self.fail_delete = False
        self.page_size = 1

    def upload(self, data, **options):
        public_id = options["public_id"]
        kind = options["resource_type"]
        if kind == "raw" and self.fail_manifest:
            raise module.CloudinaryError("private provider diagnostic must not escape")
        key = kind, options["type"], public_id
        if options.get("overwrite") or key not in self.assets:
            self.assets[key] = data.read()
        self.uploaded.append(key)
        return dict(public_id=public_id, format="png", width=1254, height=1254)

    def resources(self, **options):
        keys = sorted(key for key in self.assets if key[0] == options["resource_type"]
                      and key[1] == options["type"] and key[2].startswith(options["prefix"]))
        offset = int(options.get("next_cursor") or 0)
        page = keys[offset:offset + self.page_size]
        return dict(resources=[dict(public_id=key[2], format="png") for key in page],
                    next_cursor=str(offset + self.page_size) if offset + self.page_size < len(keys) else None)

    def destroy(self, public_id, **options):
        if self.fail_delete:
            raise module.CloudinaryError("temporary failure")
        key = options["resource_type"], options["type"], public_id
        self.deleted.append(key)
        existed = self.assets.pop(key, None) is not None
        return {"result": "ok" if existed else "not found"}

    def download(self, public_id, kind, _format, limit):
        try:
            data = self.assets[kind, "authenticated", public_id]
        except KeyError:
            raise HTTPError("https://api.cloudinary.com/redacted", 404, "not found", {}, None) from None
        if len(data) > limit:
            raise HTTPException(502, "oversized")
        return data


class CloudLibraryTests(unittest.TestCase):
    def setUp(self):
        self.cloud = MemoryCloud()
        self.store = module.CloudLibrary()
        self.store.options = dict(cloud_name="unit-test", api_key="fake", api_secret="fake", secure=True)
        self.store.download = self.cloud.download
        self.patches = [
            patch.object(module.cloudinary.uploader, "upload", self.cloud.upload),
            patch.object(module.cloudinary.uploader, "destroy", self.cloud.destroy),
            patch.object(module.cloudinary.api, "resources", self.cloud.resources),
            patch.object(module, "_library", self.store),
            patch.dict(os.environ, {"MOCKUP_LIBRARY_TOKEN": "unit-test-token-with-24-characters"}),
        ]
        for item in self.patches:
            item.start()
        self.addCleanup(lambda: [item.stop() for item in reversed(self.patches)])
        app = FastAPI()
        app.include_router(module.router)
        self.client = TestClient(app)
        self.headers = {"Authorization": "Bearer unit-test-token-with-24-characters"}

    def save(self, config=None, revision="", data=b"original image bytes"):
        config = config or product()
        uploads = {"front": photo(data)} if config["views"]["front"].get("photoName") else {}
        return self.store.save(config["id"], config, revision, uploads)

    def test_save_reopen_same_original_and_all_configuration(self):
        config = product()
        config["views"]["front"].update(calibration={"vertical": {"cm": 75}}, silhouette=[{"x": .1, "y": .2}])
        saved = self.save(config)
        # A second process/object with no local state reads Cloudinary's raw record.
        other = module.CloudLibrary()
        other.options = self.store.options
        other.download = self.cloud.download
        self.assertEqual(other.list(), [saved])
        response = self.client.get(f"/api/mockups/products/test-product/photos/front?digest={saved['photos']['front']['hash']}", headers=self.headers)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.content, b"original image bytes")
        self.assertEqual(saved["product"], config)
        self.assertEqual(saved["photos"]["front"]["hash"], hashlib.sha256(response.content).hexdigest())
        self.assertIn("no-store", response.headers["cache-control"])

    def test_metadata_edit_reuses_original_and_rejects_stale_edit(self):
        saved = self.save()
        config = product()
        config["name"] = "Nombre actualizado"
        updated = self.save(config, saved["revision"])
        self.assertNotEqual(updated["revision"], saved["revision"])
        self.assertEqual(len([key for key in self.cloud.uploaded if key[0] == "image"]), 1)
        with self.assertRaises(HTTPException) as raised:
            self.save(product(), saved["revision"])
        self.assertEqual(raised.exception.status_code, 409)
        self.assertEqual(self.store.list()[0]["product"]["name"], "Nombre actualizado")

    def test_replacement_and_removal_delete_only_obsolete_owned_photo(self):
        saved = self.save()
        original = saved["photos"]["front"]["publicId"]
        replacement = self.save(product(), saved["revision"], b"replacement original")
        self.assertNotEqual(original, replacement["photos"]["front"]["publicId"])
        self.assertEqual(self.cloud.deleted[0][2], original)
        config = product()
        config["views"]["front"].pop("photoName")
        removed = self.save(config, replacement["revision"])
        self.assertEqual(removed["photos"], {})
        self.assertEqual(len(self.cloud.deleted), 2)

    def test_failed_manifest_keeps_previous_photos_and_recovers_orphan(self):
        saved = self.save()
        original = saved["photos"]["front"]["publicId"]
        self.cloud.fail_manifest = True
        with self.assertRaises(module.CloudinaryError):
            self.save(product(), saved["revision"], b"interrupted upload")
        self.assertIn(("image", "authenticated", original), self.cloud.assets)
        self.assertEqual(self.cloud.deleted, [])
        self.cloud.fail_manifest = False
        self.save(product(), saved["revision"])
        images = [key for key in self.cloud.assets if key[0] == "image"]
        self.assertEqual(images, [("image", "authenticated", original)])

    def test_deletion_retry_tombstone_and_pagination(self):
        saved = self.save()
        another = self.save(product("another-product"))
        self.assertEqual(len(self.store.list()), 2)
        self.cloud.fail_delete = True
        deleted = self.store.delete("test-product", saved["revision"])
        self.assertTrue(deleted["deleted"])
        self.assertTrue(deleted["cleanupPending"])
        self.cloud.fail_delete = False
        deleted = self.store.delete("test-product", saved["revision"])
        self.assertFalse(deleted["cleanupPending"])
        self.assertEqual(deleted["photos"], {})
        self.assertIn(("image", "authenticated", another["photos"]["front"]["publicId"]), self.cloud.assets)
        with self.assertRaises(HTTPException) as raised:
            self.save(product(), saved["revision"])
        self.assertEqual(raised.exception.status_code, 409)

    def test_solutionsuite_assets_and_other_product_assets_are_untouched(self):
        foreign = ("image", "authenticated", "solutionsuite/products/important-photo")
        unknown = ("image", "authenticated", f"{module.PREFIX}/photos/test-product/unknown-file")
        public_same_path = ("image", "upload", module.photo_id("test-product", "front", "a" * 64))
        for key in (foreign, unknown, public_same_path):
            self.cloud.assets[key] = b"never delete"
        saved = self.save()
        self.store.delete("test-product", saved["revision"])
        for key in (foreign, unknown, public_same_path):
            self.assertEqual(self.cloud.assets[key], b"never delete")
            self.assertNotIn(key, self.cloud.deleted)

    def test_tampered_manifest_cannot_reference_foreign_photo(self):
        saved = self.save()
        key = ("raw", "authenticated", self.store.manifest_id("test-product"))
        record = json.loads(self.cloud.assets[key])
        record["photos"]["front"]["publicId"] = "solutionsuite/important-photo"
        self.cloud.assets[key] = json.dumps(record).encode()
        with self.assertRaises(HTTPException):
            self.store.delete("test-product", saved["revision"])
        self.assertEqual(self.cloud.deleted, [])

    def test_auth_validation_missing_original_and_safe_errors(self):
        self.assertEqual(self.client.get("/api/mockups/products").status_code, 401)
        self.assertEqual(self.client.delete("/api/mockups/products/test-product", headers={"X-Product-Revision": "fake"}).status_code, 401)
        self.assertEqual(self.client.put("/api/mockups/products/test-product", headers=self.headers,
            data={"product": json.dumps(product())}).status_code, 422)
        invalid = product()
        invalid["views"] = {}
        self.assertEqual(self.client.put("/api/mockups/products/test-product", headers=self.headers,
            data={"product": json.dumps(invalid)}).status_code, 422)
        self.cloud.fail_manifest = True
        response = self.client.put("/api/mockups/products/test-product", headers=self.headers,
            data={"product": json.dumps(product()), "photo_views": '["front"]'}, files={"photos": ("photo.png", b"image", "image/png")})
        self.assertEqual(response.status_code, 502)
        self.assertNotIn("private provider", response.text)
        with self.assertRaises(HTTPException):
            module.photo_id("../solutionsuite", "front", "a" * 64)

    def test_stale_delete_and_wrong_download_hash_cannot_modify_data(self):
        saved = self.save()
        headers = {**self.headers, "X-Product-Revision": "stale"}
        self.assertEqual(self.client.delete("/api/mockups/products/test-product", headers=headers).status_code, 409)
        self.assertEqual(self.client.get("/api/mockups/products/test-product/photos/front?digest=" + "0" * 64, headers=self.headers).status_code, 404)
        self.assertEqual(self.cloud.deleted, [])
        key = ("image", "authenticated", saved["photos"]["front"]["publicId"])
        self.cloud.assets[key] = b"unexpected transformation"
        response = self.client.get(f"/api/mockups/products/test-product/photos/front?digest={saved['photos']['front']['hash']}", headers=self.headers)
        self.assertEqual(response.status_code, 502)


if __name__ == "__main__":
    unittest.main()
