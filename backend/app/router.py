import logging
import os
from datetime import date

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from .config import FACE_DETECTION_MODEL, FACE_TOLERANCE, UPLOADS_DIR
from .database import get_db
from .models import Quiz
from .schemas import FaceMatch, QuizOut, UploadResult
from .services import (
    find_matches,
    get_or_create_game,
    get_or_create_quiz,
    load_old_faces,
    process_photo,
)

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
# POST /upload
# ---------------------------------------------------------------------------

@router.post("/upload", response_model=UploadResult)
async def upload_photos(
    files: list[UploadFile] = File(..., description="One or more photo files"),
    quiz_name: str = Form(..., min_length=1, max_length=255),
    game_date: date = Form(..., description="YYYY-MM-DD"),
    db: Session = Depends(get_db),
):
    if not files:
        raise HTTPException(status_code=400, detail="At least one file is required")

    try:
        quiz = get_or_create_quiz(db, quiz_name.strip())
        game = get_or_create_game(db, quiz.id, game_date)

        # Load historical faces BEFORE inserting new ones so the query
        # cannot accidentally return faces from the current upload.
        old_data = load_old_faces(db, quiz.id, game.id)

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

        # Run matching while the session is still open (objects are live).
        cheaters_raw = find_matches(new_face_records, old_data, tolerance=FACE_TOLERANCE)

        db.commit()
        logger.info(
            "Upload complete: quiz=%r game=%s faces=%d matches=%d",
            quiz_name, game_date, len(new_face_records), len(cheaters_raw),
        )

        return UploadResult(
            total_faces_found=len(new_face_records),
            cheaters=[FaceMatch(**m) for m in cheaters_raw],
        )

    except HTTPException:
        raise
    except Exception as exc:
        db.rollback()
        logger.exception("Upload failed")
        raise HTTPException(status_code=500, detail=str(exc))


# ---------------------------------------------------------------------------
# GET /faces/{filepath}
# ---------------------------------------------------------------------------

@router.get("/faces/{filepath:path}")
def serve_face(filepath: str):
    """Serve a face crop image by its relative path (game_id/uuid.jpg)."""
    faces_base = os.path.realpath(os.path.join(UPLOADS_DIR, "faces"))
    full_path = os.path.realpath(os.path.join(faces_base, filepath))

    # Guard against path traversal
    if not full_path.startswith(faces_base + os.sep) and full_path != faces_base:
        raise HTTPException(status_code=400, detail="Invalid path")

    if not os.path.isfile(full_path):
        raise HTTPException(status_code=404, detail="Image not found")

    return FileResponse(full_path, media_type="image/jpeg")
