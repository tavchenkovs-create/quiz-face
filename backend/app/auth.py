import hashlib

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

from .config import APP_PASSWORD

auth_router = APIRouter()

VALID_TOKEN = hashlib.sha256(APP_PASSWORD.encode()).hexdigest()


class LoginRequest(BaseModel):
    password: str


@auth_router.post("/auth/login")
def login(body: LoginRequest):
    if body.password != APP_PASSWORD:
        raise HTTPException(status_code=401, detail="Неверный пароль")
    return {"token": VALID_TOKEN}


def check_token(authorization: str | None = Header(default=None)) -> None:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Требуется авторизация")
    token = authorization.removeprefix("Bearer ")
    if token != VALID_TOKEN:
        raise HTTPException(status_code=401, detail="Неверный токен")
