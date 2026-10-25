"""Personal Cloudinary catalogue. Never accepts a Cloudinary public ID from a client.

One API process/instance owns writes (the current Render/uvicorn configuration).
The server lock plus revision checks serialize edits from different devices.
"""
from __future__ import annotations

import hashlib
import io
import json
import os
import re
import secrets
import threading
import time
import uuid
from urllib.error import HTTPError, URLError
from urllib.request import urlopen

import cloudinary
import cloudinary.api
import cloudinary.uploader
import cloudinary.utils
from cloudinary.exceptions import Error as CloudinaryError
from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, UploadFile
from fastapi.responses import Response
from .auth import session_user

# Deliberately fixed: sharing credentials with SolutionSuite never shares its assets.
PREFIX = "gas3d/mockup-studio/v1"
MARKER = "gas3d-mockup-studio"
VIEWS = ("front", "back", "left", "right", "leftSleeve", "rightSleeve")
MAX_PHOTO = 55 * 1024 * 1024
MAX_MANIFEST = 512 * 1024
ID = re.compile(r"^[a-zA-Z0-9_-]{1,100}$")
HASH = re.compile(r"^[a-f0-9]{64}$")
router = APIRouter(prefix="/api/mockups", tags=["Mockup catalogue"])


def valid_id(value: str) -> str:
    if not ID.fullmatch(value):
        raise HTTPException(422, "Identificador de producto inválido.")
    return value


def photo_id(product_id: str, view: str, digest: str) -> str:
    valid_id(product_id)
    if view not in VIEWS or not HASH.fullmatch(digest):
        raise HTTPException(422, "Referencia de fotografía inválida.")
    return f"{PREFIX}/photos/{product_id}/{view}-{digest}"


def authorize(authorization: str | None = Header(default=None)) -> None:
    if session_user(authorization):
        return
    token = os.getenv("MOCKUP_LIBRARY_TOKEN", "")
    if len(token) < 24:
        raise HTTPException(503, "Falta configurar la clave privada del catálogo en el servidor.")
    supplied = (authorization or "").removeprefix("Bearer ")
    if not secrets.compare_digest(supplied.encode(), token.encode()):
        raise HTTPException(401, "Clave de catálogo incorrecta.")


class CloudLibrary:
    def __init__(self):
        config = cloudinary.Config()
        self.options = dict(cloud_name=config.cloud_name, api_key=config.api_key,
                            api_secret=config.api_secret, secure=True, timeout=90)
        self.lock = threading.RLock()

    @property
    def configured(self):
        return all(self.options.get(key) for key in ("cloud_name", "api_key", "api_secret"))

    def manifest_id(self, product_id):
        return f"{PREFIX}/products/{valid_id(product_id)}.json"

    def download(self, public_id, resource_type, file_format, limit):
        # Signed API downloads read the current original, avoiding stale CDN manifests.
        url = cloudinary.utils.private_download_url(
            public_id, file_format, resource_type=resource_type, type="authenticated",
            expires_at=int(time.time()) + 120, **self.options)
        with urlopen(url, timeout=90) as response:
            data = response.read(limit + 1)
        if len(data) > limit:
            raise HTTPException(502, "El archivo remoto supera el límite permitido.")
        return data

    def validate_record(self, record, product_id):
        if (record.get("app") != MARKER or record.get("schemaVersion") != 1
                or record.get("product", {}).get("id") != product_id):
            raise HTTPException(502, "El registro remoto no pertenece a Mockup Studio.")
        # Exact product/view/hash validation precedes EVERY read or deletion of a photo.
        for view, photo in list(record.get("photos", {}).items()) + list(record.get("garbage", {}).items()):
            # Garbage keys include a unique suffix; its source view is explicit.
            source_view = photo.get("view", view)
            if photo.get("publicId") != photo_id(product_id, source_view, photo.get("hash", "")):
                raise HTTPException(502, "Fotografía ajena al espacio reservado de GAS3D.")
        return record

    def read(self, product_id):
        try:
            data = self.download(self.manifest_id(product_id), "raw", None, MAX_MANIFEST)
        except HTTPError as error:
            if error.code == 404:
                error.close()
                return None
            raise
        return self.validate_record(json.loads(data), product_id)

    def write(self, record):
        product_id = record["product"]["id"]
        self.validate_record(record, product_id)
        data = json.dumps(record, ensure_ascii=False, allow_nan=False).encode()
        if len(data) > MAX_MANIFEST:
            raise HTTPException(413, "La configuración del producto es demasiado grande.")
        cloudinary.uploader.upload(
            io.BytesIO(data), public_id=self.manifest_id(product_id), resource_type="raw",
            type="authenticated", overwrite=True, invalidate=True,
            asset_folder="GAS3D/Mockup Studio/Products", **self.options)

    def list(self):
        records = []
        cursor = None
        while True:
            page = cloudinary.api.resources(
                resource_type="raw", type="authenticated", prefix=f"{PREFIX}/products/",
                max_results=500, next_cursor=cursor, **self.options)
            for asset in page.get("resources", []):
                public_id = asset["public_id"]
                product_id = public_id.removeprefix(f"{PREFIX}/products/").removesuffix(".json")
                if public_id != self.manifest_id(product_id):
                    raise HTTPException(502, "Registro inesperado en el catálogo de GAS3D.")
                record = self.read(product_id)
                if record:
                    records.append(self.public_record(record))
            cursor = page.get("next_cursor")
            if not cursor:
                return records

    def public_record(self, record):
        return dict(product=record["product"], revision=record["revision"],
                    deleted=record.get("deleted", False), cleanupPending=bool(record.get("garbage")),
                    cloudName=self.options["cloud_name"],
                    photos={view: {key: photo[key] for key in ("publicId", "hash")}
                            for view, photo in record["photos"].items()})

    def owned_photos(self, product_id):
        """Find only exact generated IDs, including uploads interrupted before a commit."""
        prefix = f"{PREFIX}/photos/{valid_id(product_id)}/"
        photos = {}
        cursor = None
        while True:
            page = cloudinary.api.resources(resource_type="image", type="authenticated",
                prefix=prefix, max_results=500, next_cursor=cursor, **self.options)
            for asset in page.get("resources", []):
                public_id = asset["public_id"]
                match = re.fullmatch(r"(front|back|left|right|leftSleeve|rightSleeve)-([a-f0-9]{64})",
                                     public_id.removeprefix(prefix))
                if match and public_id == photo_id(product_id, *match.groups()):
                    view, digest = match.groups()
                    photos[public_id] = dict(publicId=public_id, hash=digest, view=view, format=asset.get("format"))
            cursor = page.get("next_cursor")
            if not cursor:
                return photos

    def cleanup(self, record):
        self.validate_record(record, record["product"]["id"])
        remaining = {}
        for key, photo in record.get("garbage", {}).items():
            try:
                result = cloudinary.uploader.destroy(photo["publicId"], resource_type="image",
                    type="authenticated", invalidate=True, **self.options)
                if result.get("result") not in ("ok", "not found"):
                    remaining[key] = photo
            except (CloudinaryError, OSError):
                remaining[key] = photo
        if remaining != record.get("garbage", {}):
            cleaned = {**record, "garbage": remaining}
            # If recording cleanup fails, the original garbage list permits safe retry.
            try:
                self.write(cleaned)
                record = cleaned
            except (CloudinaryError, OSError):
                pass
        return record

    def save(self, product_id, product, revision, uploads):
        valid_id(product_id)
        validate_product(product, product_id)
        with self.lock:
            previous = self.read(product_id)
            if previous and (previous.get("deleted") or previous["revision"] != revision):
                raise HTTPException(409, "Otro dispositivo modificó o eliminó este producto. Recuperá la versión de la nube o duplicá tus cambios locales.")
            if not previous and revision:
                raise HTTPException(409, "El producto ya no existe en este catálogo. Duplicalo para guardarlo como nuevo.")
            expected = {view for view in VIEWS if product["views"][view].get("photoName")}
            if expected != set(uploads):
                raise HTTPException(422, "Faltan fotografías originales. No se guardó el producto incompleto.")
            photos = {}
            owned = self.owned_photos(product_id)
            try:
                for view, upload in uploads.items():
                    upload.file.seek(0)
                    data = upload.file.read(MAX_PHOTO + 1)
                    if not data or len(data) > MAX_PHOTO:
                        raise HTTPException(413, "Cada fotografía debe ocupar entre 1 byte y 55 MB.")
                    digest = hashlib.sha256(data).hexdigest()
                    public_id = photo_id(product_id, view, digest)
                    old = (previous or {}).get("photos", {}).get(view)
                    if old and old["hash"] == digest:
                        photos[view] = old
                        continue
                    result = cloudinary.uploader.upload(
                        io.BytesIO(data), public_id=public_id, resource_type="image",
                        type="authenticated", overwrite=False,
                        allowed_formats=["png", "jpg", "jpeg", "webp"],
                        asset_folder="GAS3D/Mockup Studio/Photos", **self.options)
                    photo = dict(publicId=public_id, hash=digest, format=result["format"], view=view)
                    width, height = result.get("width", 0), result.get("height", 0)
                    if min(width, height) < 1 or max(width, height) > 8192 or width * height > 20_000_000:
                        raise HTTPException(422, "La fotografía supera los límites de 20 MP o 8192 px por lado.")
                    photos[view] = photo
                garbage = dict((previous or {}).get("garbage", {}))
                garbage.update(owned)
                for view, old in (previous or {}).get("photos", {}).items():
                    if old["publicId"] != photos.get(view, {}).get("publicId"):
                        garbage[old["publicId"]] = {**old, "view": view}
                # A previously failed cleanup may refer to an image now reused.
                for photo in photos.values():
                    garbage.pop(photo["publicId"], None)
                record = dict(app=MARKER, schemaVersion=1, product=product, photos=photos,
                              revision=uuid.uuid4().hex, deleted=False, garbage=garbage)
                self.write(record)
            except Exception:
                # A timed-out write may have committed. Retain originals; a later save
                # or delete discovers and cleans interrupted uploads by exact owned IDs.
                raise
            return self.public_record(self.cleanup(record))

    def delete(self, product_id, revision):
        with self.lock:
            record = self.read(product_id)
            if not record:
                raise HTTPException(404, "Producto no encontrado.")
            if revision not in (record["revision"], record.get("deletedRevision")):
                raise HTTPException(409, "Otro dispositivo modificó el producto. Actualizá el catálogo antes de eliminarlo.")
            if not record.get("deleted"):
                garbage = dict(record.get("garbage", {}))
                garbage.update(self.owned_photos(product_id))
                garbage.update({photo["publicId"]: {**photo, "view": view}
                                for view, photo in record["photos"].items()})
                record = {**record, "deleted": True, "photos": {}, "garbage": garbage,
                          "deletedRevision": record["revision"], "revision": uuid.uuid4().hex}
                # A tiny tombstone prevents a stale device from recreating a deleted product.
                self.write(record)
            return self.public_record(self.cleanup(record))


def validate_product(product, product_id):
    if (not isinstance(product, dict) or product.get("id") != product_id
            or not isinstance(product.get("name"), str) or not 1 <= len(product["name"].strip()) <= 200
            or not isinstance(product.get("type"), str) or len(product["type"]) > 100
            or not isinstance(product.get("views"), dict) or set(product["views"]) != set(VIEWS)):
        raise HTTPException(422, "Configuración de producto inválida.")
    for view in product["views"].values():
        if (not isinstance(view, dict) or not isinstance(view.get("enabled"), bool)
                or not isinstance(view.get("zones"), list) or len(view["zones"]) > 100
                or (view.get("photoName") is not None and not isinstance(view["photoName"], str))):
            raise HTTPException(422, "Configuración de vista inválida.")


_library = CloudLibrary()


def library():
    if not _library.configured:
        raise HTTPException(503, "Falta configurar Cloudinary en el servidor de GAS3D.")
    return _library


def cloud_call(callback):
    try:
        return callback()
    except (CloudinaryError, URLError, OSError, ValueError, KeyError, TypeError):
        # SDK exceptions may contain signed URLs or credentials: never return them.
        raise HTTPException(502, "No se pudo completar la operación en Cloudinary. Conservamos los datos locales; reintentá.") from None


@router.get("/health")
def health():
    return {"configured": CloudLibrary().configured and len(os.getenv("MOCKUP_LIBRARY_TOKEN", "")) >= 24}


@router.get("/products", dependencies=[Depends(authorize)])
def list_products():
    store = library()
    return cloud_call(lambda: {"cloudName": store.options["cloud_name"], "records": store.list()})


@router.put("/products/{product_id}", dependencies=[Depends(authorize)])
def save_product(product_id: str, product: str = Form(...), revision: str = Form(""),
                 photo_views: str = Form("[]"), photos: list[UploadFile] = File(default=[])):
    valid_id(product_id)
    if len(product.encode()) > MAX_MANIFEST or len(photo_views) > 200 or len(photos) > len(VIEWS):
        raise HTTPException(413, "El producto supera el tamaño permitido.")
    try:
        config = json.loads(product)
        views = json.loads(photo_views)
    except ValueError:
        raise HTTPException(422, "Configuración JSON inválida.") from None
    if not isinstance(views, list) or len(views) != len(photos) or any(v not in VIEWS for v in views) or len(set(views)) != len(views):
        raise HTTPException(422, "Fotografías de vistas inválidas.")
    return cloud_call(lambda: library().save(product_id, config, revision, dict(zip(views, photos))))


@router.delete("/products/{product_id}", dependencies=[Depends(authorize)])
def delete_product(product_id: str, revision: str = Header(alias="X-Product-Revision")):
    valid_id(product_id)
    return cloud_call(lambda: library().delete(product_id, revision))


@router.get("/products/{product_id}/photos/{view}", dependencies=[Depends(authorize)])
def get_photo(product_id: str, view: str, digest: str):
    photo_id(product_id, view, digest)
    store = library()

    def original():
        record = store.read(product_id)
        photo = (record or {}).get("photos", {}).get(view)
        if not photo or photo["hash"] != digest or record.get("deleted"):
            raise HTTPException(404, "Fotografía no encontrada. Actualizá el catálogo.")
        data = store.download(photo["publicId"], "image", photo["format"], MAX_PHOTO)
        if hashlib.sha256(data).hexdigest() != digest:
            raise HTTPException(502, "Cloudinary no devolvió los bytes originales de la fotografía.")
        mime = "image/jpeg" if photo["format"] in ("jpg", "jpeg") else f"image/{photo['format']}"
        return Response(data, media_type=mime, headers={"Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff"})

    return cloud_call(original)
