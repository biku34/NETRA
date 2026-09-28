"""Login tokens. One development account for now; the role travels inside the token."""
import hmac
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from . import settings
from .roles import DEFAULT_ROLE, ROLES, can

bearer = HTTPBearer(auto_error=False)


def check_credentials(user: str, password: str) -> bool:
    return hmac.compare_digest(user, settings.DEV_USER) and hmac.compare_digest(password, settings.DEV_PASSWORD)


def issue(role_id: str = DEFAULT_ROLE, user: str = settings.DEV_USER) -> str:
    now = datetime.now(timezone.utc)
    return jwt.encode({"sub": user, "role": role_id, "iat": now, "exp": now + timedelta(hours=settings.JWT_HOURS)}, settings.JWT_SECRET, algorithm="HS256")


def current_role(creds: HTTPAuthorizationCredentials | None = Depends(bearer)) -> dict:
    if creds is None:
        raise HTTPException(401, "Sign in to continue")
    try:
        claims = jwt.decode(creds.credentials, settings.JWT_SECRET, algorithms=["HS256"])
    except jwt.PyJWTError:
        raise HTTPException(401, "Session expired. Sign in again") from None
    role = ROLES.get(claims.get("role"))
    if role is None:
        raise HTTPException(401, "Unknown role in session. Sign in again")
    return role


def require(permission: str):
    def check(role: dict = Depends(current_role)) -> dict:
        if not can(role, permission):
            raise HTTPException(403, f"The {role['short']} role cannot do this")
        return role

    return check
