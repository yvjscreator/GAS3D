"""Single-owner GAS3D login. Provider credentials never leave the API server."""
from __future__ import annotations

import hashlib
import os
import secrets
import threading
import time
from collections import deque

from fastapi import APIRouter, Header, HTTPException, Request
from fastapi.responses import JSONResponse
from itsdangerous import BadSignature, URLSafeTimedSerializer
from pydantic import BaseModel, Field
from starlette.middleware.base import BaseHTTPMiddleware

router = APIRouter(prefix="/api/auth", tags=["GAS3D access"])
SESSION_SECONDS = 7 * 24 * 60 * 60
HASH_ROUNDS = 600_000
_attempts: dict[str, deque] = {}
_attempt_lock = threading.Lock()


def auth_enabled():
    return os.getenv("GAS3D_AUTH_ENABLED", "false").lower() == "true"


def password_hash(password: str, salt: bytes | None = None):
    salt = salt or secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, HASH_ROUNDS)
    return f"pbkdf2_sha256${HASH_ROUNDS}${salt.hex()}${digest.hex()}"


def _hash_parts(encoded):
    algorithm, rounds, salt, digest = encoded.split("$")
    iterations = int(rounds)
    salt_bytes, expected = bytes.fromhex(salt), bytes.fromhex(digest)
    if algorithm != "pbkdf2_sha256" or not 600_000 <= iterations <= 2_000_000 or len(salt_bytes) != 16 or len(expected) != 32:
        raise ValueError("Invalid password hash")
    return iterations, salt_bytes, expected


def auth_configured():
    try:
        _hash_parts(os.getenv("GAS3D_AUTH_PASSWORD_HASH", ""))
        return bool(os.getenv("GAS3D_AUTH_USERNAME", "admin")) and len(os.getenv("GAS3D_AUTH_SECRET", "")) >= 32
    except (ValueError, TypeError):
        return False


def _serializer():
    # Changing the username/password revokes every earlier session, even across restarts.
    identity = os.getenv("GAS3D_AUTH_USERNAME", "admin") + os.getenv("GAS3D_AUTH_PASSWORD_HASH", "")
    return URLSafeTimedSerializer(os.getenv("GAS3D_AUTH_SECRET", ""), salt="gas3d-access-v1:" + hashlib.sha256(identity.encode()).hexdigest(), signer_kwargs={"digest_method": hashlib.sha256})


def session_user(authorization: str | None):
    if not auth_enabled() or not auth_configured() or not authorization or not authorization.startswith("Bearer gas3d.") or len(authorization) > 4096:
        return None
    try:
        payload = _serializer().loads(authorization.removeprefix("Bearer gas3d."), max_age=SESSION_SECONDS)
        if not isinstance(payload, dict) or payload.get("user") != os.getenv("GAS3D_AUTH_USERNAME", "admin"):
            return None
        if not isinstance(payload.get("expiresAt"), int) or payload["expiresAt"] <= time.time():
            return None
        return payload
    except (BadSignature, ValueError, TypeError):
        return None


def catalogue_key_valid(authorization: str | None):
    token = os.getenv("MOCKUP_LIBRARY_TOKEN", "")
    supplied = (authorization or "").removeprefix("Bearer ")
    return len(token) >= 24 and secrets.compare_digest(supplied.encode(), token.encode())


class AuthenticationGuard(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        path = request.url.path
        public = {"/api/auth/login", "/api/auth/session", "/api/subtitles/health", "/api/mockups/health"}
        if auth_enabled() and path.startswith("/api/") and path not in public and request.method != "OPTIONS":
            if not auth_configured():
                return JSONResponse({"detail": "Falta configurar el acceso a GAS3D en el servidor."}, status_code=503, headers={"Cache-Control": "no-store"})
            authorization = request.headers.get("authorization")
            # Existing private catalogue clients retain their original, limited scope.
            legacy_catalogue = path.startswith("/api/mockups/") and catalogue_key_valid(authorization)
            if not session_user(authorization) and not legacy_catalogue:
                return JSONResponse({"detail": "Iniciá sesión en GAS3D para continuar."}, status_code=401, headers={"Cache-Control": "no-store"})
        return await call_next(request)


class Login(BaseModel):
    username: str = Field(min_length=1, max_length=128)
    password: str = Field(min_length=1, max_length=256)


def _reserve_attempt(client):
    now = time.monotonic()
    with _attempt_lock:
        for key in list(_attempts):
            if not _attempts[key] or _attempts[key][-1] < now - 300:
                del _attempts[key]
        # Bounded storage and work, even under many unauthenticated clients.
        if client not in _attempts and len(_attempts) >= 1024:
            raise HTTPException(429, "Demasiados intentos. Esperá unos minutos.", headers={"Retry-After": "300"})
        attempts = _attempts.setdefault(client, deque())
        while attempts and attempts[0] < now - 300:
            attempts.popleft()
        if len(attempts) >= 8:
            raise HTTPException(429, "Demasiados intentos. Esperá unos minutos.", headers={"Retry-After": "300"})
        attempts.append(now)


@router.get("/session")
def status(authorization: str | None = Header(default=None)):
    session = session_user(authorization)
    return JSONResponse({"enabled": auth_enabled(), "configured": auth_configured(), "user": session["user"] if session else None,
                         "expiresAt": session["expiresAt"] if session else None}, headers={"Cache-Control": "no-store"})


@router.post("/login")
def login(values: Login, request: Request):
    if not auth_enabled() or not auth_configured():
        raise HTTPException(503, "Falta configurar el acceso a GAS3D en el servidor.")
    client = request.client.host if request.client else "unknown"
    _reserve_attempt(client)
    iterations, salt, expected = _hash_parts(os.getenv("GAS3D_AUTH_PASSWORD_HASH", ""))
    actual = hashlib.pbkdf2_hmac("sha256", values.password.encode(), salt, iterations)
    valid_password = secrets.compare_digest(actual, expected)
    valid_user = secrets.compare_digest(values.username.encode(), os.getenv("GAS3D_AUTH_USERNAME", "admin").encode())
    if not valid_password or not valid_user:
        raise HTTPException(401, "Usuario o contraseña incorrectos.", headers={"Cache-Control": "no-store"})
    with _attempt_lock:
        _attempts.pop(client, None)
    payload = {"user": values.username, "expiresAt": int(time.time()) + SESSION_SECONDS, "nonce": secrets.token_urlsafe(16)}
    return JSONResponse({"token": "gas3d." + _serializer().dumps(payload), "user": values.username, "expiresAt": payload["expiresAt"]}, headers={"Cache-Control": "no-store"})
