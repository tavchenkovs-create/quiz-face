import logging
import os
from datetime import date as date_type

import requests as http_requests
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from .config import FACE_DETECTION_MODEL, FACE_TOLERANCE, UPLOADS_DIR, VK_SERVICE_KEY
from .database import get_db
from .models import Quiz
from .schemas import CheckResult, FaceMatch, QuizOut, UploadResult, VkUploadRequest, VkUploadResult
from .services import (
    check_faces_from_images,
    get_or_create_game,
    get_or_create_quiz,
    load_all_quiz_faces,
    process_photo,
)
from .vk import get_album_photos

logger = logging.getLogger(__name__)

router = APIRouter()

ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"}


# ---------------------------------------------------------------------------
# GET /quizzes
# ---------------------------------------------------------------------------

@router.get("/quizzes", response_model=list[QuizOut])
def list_quizzes(db: Session = Depends(get_db)):
    try:
        return db.query(Quiz).order_by(Quiz.name).all()
    except Exception as exc:
        logger.exception("Failed to list quizzes")
        raise HTTPException(status_code=500, detail=str(exc))


# ---------------------------------------------------------------------------
# POST /upload  — сохранить фото в базу, вернуть кол-во найденных лиц
# ---------------------------------------------------------------------------

@router.post("/upload", response_model=UploadResult)
async def upload_photos(
    files: list[UploadFile] = File(..., description="One or more photo files"),
    quiz_name: str = Form(..., min_length=1, max_length=255),
    game_date: date_type = Form(..., description="YYYY-MM-DD"),
    db: Session = Depends(get_db),
):
    if not files:
        raise HTTPException(status_code=400, detail="At least one file is required")

    try:
        quiz = get_or_create_quiz(db, quiz_name.strip())
        game = get_or_create_game(db, quiz.id, game_date)

        new_face_records = []
        for upload in files:
            if upload.content_type and upload.content_type not in ALLOWED_CONTENT_TYPES:
                logger.warning("Skipping %r: unsupported type %s", upload.filename, upload.content_type)
                continue

            image_data = await upload.read()
            if not image_data:
                logger.warning("Skipping empty file %r", upload.filename)
                continue

            faces = process_photo(
                db,
                image_data,
                upload.filename or "photo.jpg",
                game,
                UPLOADS_DIR,
                detection_model=FACE_DETECTION_MODEL,
            )
            new_face_records.extend(faces)

        db.commit()
        logger.info("Upload complete: quiz=%r game=%s faces=%d", quiz_name, game_date, len(new_face_records))

        return UploadResult(total_faces_found=len(new_face_records))

    except HTTPException:
        raise
    except Exception as exc:
        db.rollback()
        logger.exception("Upload failed")
        raise HTTPException(status_code=500, detail=str(exc))


# ---------------------------------------------------------------------------
# POST /check  — проверить фото на совпадения, ничего не сохранять
# ---------------------------------------------------------------------------

@router.post("/check", response_model=CheckResult)
async def check_photos(
    files: list[UploadFile] = File(..., description="One or more photo files"),
    quiz_name: str = Form(..., min_length=1, max_length=255),
    db: Session = Depends(get_db),
):
    if not files:
        raise HTTPException(status_code=400, detail="At least one file is required")

    quiz = db.query(Quiz).filter(Quiz.name == quiz_name.strip()).first()
    if not quiz:
        raise HTTPException(status_code=404, detail=f"Квиз «{quiz_name}» не найден")

    try:
        all_data = load_all_quiz_faces(db, quiz.id)

        images: list[tuple[bytes, str]] = []
        for upload in files:
            if upload.content_type and upload.content_type not in ALLOWED_CONTENT_TYPES:
                logger.warning("Skipping %r: unsupported type %s", upload.filename, upload.content_type)
                continue
            image_data = await upload.read()
            if image_data:
                images.append((image_data, upload.filename or "photo.jpg"))

        total, cheaters_raw = check_faces_from_images(
            images,
            all_data,
            UPLOADS_DIR,
            tolerance=FACE_TOLERANCE,
            detection_model=FACE_DETECTION_MODEL,
        )

        logger.info("Check complete: quiz=%r faces=%d matches=%d", quiz_name, total, len(cheaters_raw))

        return CheckResult(
            total_faces_found=total,
            cheaters=[FaceMatch(**m) for m in cheaters_raw],
        )

    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Check failed")
        raise HTTPException(status_code=500, detail=str(exc))


# ---------------------------------------------------------------------------
# POST /upload-from-vk  — скачать альбом ВКонтакте и сохранить в базу
# ---------------------------------------------------------------------------

@router.post("/upload-from-vk", response_model=VkUploadResult)
async def upload_from_vk(
    body: VkUploadRequest,
    db: Session = Depends(get_db),
):
    if not VK_SERVICE_KEY:
        raise HTTPException(status_code=503, detail="VK_SERVICE_KEY не задан на сервере")

    try:
        game_date = date_type.fromisoformat(body.game_date)
    except ValueError:
        raise HTTPException(status_code=400, detail="Неверный формат даты, ожидается YYYY-MM-DD")

    # --- download photos from VK -------------------------------------------
    try:
        photos = get_album_photos(body.album_url, VK_SERVICE_KEY)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except http_requests.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"Ошибка при обращении к ВКонтакте: {exc}")
    except Exception as exc:
        logger.exception("VK fetch failed")
        raise HTTPException(status_code=502, detail=f"Не удалось загрузить альбом: {exc}")

    if not photos:
        raise HTTPException(status_code=400, detail="В альбоме не найдено фотографий")

    # --- save to DB --------------------------------------------------------
    try:
        quiz = get_or_create_quiz(db, body.quiz_name.strip())
        game = get_or_create_game(db, quiz.id, game_date)

        total_faces = 0
        for i, image_data in enumerate(photos):
            faces = process_photo(
                db,
                image_data,
                f"vk_photo_{i + 1}.jpg",
                game,
                UPLOADS_DIR,
                detection_model=FACE_DETECTION_MODEL,
            )
            total_faces += len(faces)

        db.commit()
        logger.info(
            "VK upload complete: quiz=%r game=%s photos=%d faces=%d",
            body.quiz_name, game_date, len(photos), total_faces,
        )
        return VkUploadResult(total_faces_found=total_faces, total_photos=len(photos))

    except HTTPException:
        raise
    except Exception as exc:
        db.rollback()
        logger.exception("VK upload DB save failed")
        raise HTTPException(status_code=500, detail=str(exc))


# ---------------------------------------------------------------------------
# GET /faces/{filepath}
# ---------------------------------------------------------------------------

@router.get("/faces/{filepath:path}")
def serve_face(filepath: str):
    """Serve a face crop image by its relative path (game_id/uuid.jpg or tmp/uuid.jpg)."""
    faces_base = os.path.realpath(os.path.join(UPLOADS_DIR, "faces"))
    full_path = os.path.realpath(os.path.join(faces_base, filepath))

    if not full_path.startswith(faces_base + os.sep) and full_path != faces_base:
        raise HTTPException(status_code=400, detail="Invalid path")

    if not os.path.isfile(full_path):
        raise HTTPException(status_code=404, detail="Image not found")

    return FileResponse(full_path, media_type="image/jpeg")
