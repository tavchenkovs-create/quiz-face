import logging
import os
import threading
import uuid as uuid_module
from datetime import date as date_type

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, JSONResponse
from sqlalchemy.orm import Session

from .config import FACE_DETECTION_MODEL, FACE_TOLERANCE, UPLOADS_DIR, VK_SERVICE_KEY
from .database import SessionLocal, get_db
from .models import FaceEncoding, Photo, Quiz
from .schemas import BatchUploadRequest, CheckResult, FaceMatch, QuizOut, TaskResponse, VkUploadRequest
from .services import (
    check_faces_from_images,
    extract_faces_parallel,
    get_or_create_game,
    get_or_create_quiz,
    load_all_quiz_faces,
)
from .task_store import tasks, tasks_lock
from .vk import download_photos, get_album_photo_urls

logger = logging.getLogger(__name__)

router = APIRouter()

ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"}


# ---------------------------------------------------------------------------
# Background helpers
# ---------------------------------------------------------------------------

def _save_faces_to_db(db, game_id: int, orig_path: str, face_results: list[dict]) -> None:
    """Sequential DB write for one photo. Called from the main background thread."""
    photo = Photo(game_id=game_id, filename=orig_path)
    db.add(photo)
    db.flush()
    for fr in face_results:
        db.add(FaceEncoding(
            photo_id=photo.id,
            encoding=fr["encoding_bytes"],
            face_image_filename=fr["face_image_filename"],
        ))
    db.flush()


def _process_images_bg(
    task_id: str,
    images: list[tuple[bytes, str]],   # (image_data, filename)
    game_id: int,
    db,
) -> None:
    """Sequential face detection: one photo at a time, commit after each."""
    for image_data, filename in images:
        face_results: list[dict] = []
        try:
            orig_path, face_results = extract_faces_parallel(
                image_data, filename, game_id, UPLOADS_DIR, FACE_DETECTION_MODEL
            )
            _save_faces_to_db(db, game_id, orig_path, face_results)
            db.commit()
        except Exception:
            logger.exception("Error processing image %r", filename)
            try: db.rollback()
            except Exception: pass

        with tasks_lock:
            t = tasks[task_id]
            t["processed"] += 1
            t["faces_found"] += len(face_results)


def _run_files_bg(
    task_id: str,
    images: list[tuple[bytes, str]],
    quiz_name: str,
    game_date: date_type,
) -> None:
    """Background thread for POST /upload."""
    db = SessionLocal()
    try:
        quiz = get_or_create_quiz(db, quiz_name)
        game = get_or_create_game(db, quiz.id, game_date)
        db.commit()  # commit quiz/game before heavy work

        _process_images_bg(task_id, images, game.id, db)

        with tasks_lock:
            tasks[task_id].update({"done": True, "total_photos": len(images)})
        logger.info("Files task %s done: %d photos, %d faces", task_id, len(images), tasks[task_id]["faces_found"])

    except Exception as exc:
        logger.exception("Files background task %s failed", task_id)
        try: db.rollback()
        except Exception: pass
        with tasks_lock:
            tasks[task_id].update({"error": str(exc), "done": True})
    finally:
        db.close()


def _run_vk_bg(
    task_id: str,
    album_url: str,
    quiz_name: str,
    game_date: date_type,
) -> None:
    """Background thread for POST /upload-from-vk."""
    db = SessionLocal()
    try:
        # Step 1: get photo URLs (fast API call, updates total immediately)
        try:
            urls = get_album_photo_urls(album_url, VK_SERVICE_KEY)
        except ValueError as exc:
            with tasks_lock:
                tasks[task_id].update({"error": str(exc), "done": True})
            return

        with tasks_lock:
            tasks[task_id]["total"] = len(urls)

        # Step 2: download all photos in parallel
        raw = download_photos(urls)
        logger.info("Downloaded %d/%d VK photo(s)", sum(1 for b in raw if b), len(urls))

        # Step 3: create quiz/game, then process photos sequentially
        quiz = get_or_create_quiz(db, quiz_name)
        game = get_or_create_game(db, quiz.id, game_date)
        db.commit()

        faces_found = 0
        for i, image_data in enumerate(raw):
            if image_data:
                face_results: list[dict] = []
                try:
                    orig_path, face_results = extract_faces_parallel(
                        image_data, f"vk_{i+1}.jpg", game.id, UPLOADS_DIR, FACE_DETECTION_MODEL
                    )
                    _save_faces_to_db(db, game.id, orig_path, face_results)
                    db.commit()
                except Exception:
                    logger.exception("Error processing VK photo %d", i + 1)
                    try: db.rollback()
                    except Exception: pass
                faces_found += len(face_results)

            with tasks_lock:
                t = tasks[task_id]
                t["processed"] = i + 1
                t["faces_found"] = faces_found

        with tasks_lock:
            tasks[task_id].update({"done": True, "total_photos": len(urls)})
        logger.info("VK task %s done: %d photos, %d faces", task_id, len(urls), tasks[task_id]["faces_found"])

    except Exception as exc:
        logger.exception("VK background task %s failed", task_id)
        try: db.rollback()
        except Exception: pass
        with tasks_lock:
            tasks[task_id].update({"error": str(exc), "done": True})
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Batch background helper
# ---------------------------------------------------------------------------

def _run_batch_bg(task_id: str, items: list[dict]) -> None:
    """Background thread for POST /upload-batch. Processes albums sequentially."""
    with tasks_lock:
        tasks[task_id].update({
            "total_albums":       len(items),
            "current_album":      0,
            "current_album_name": "",
            "current_faces":      0,
            "current_photos":     0,
            "results":            [],
        })

    for i, item in enumerate(items):
        quiz_name  = item["quiz_name"]
        album_url  = item["album_url"]
        game_date_str = item["game_date"]

        with tasks_lock:
            tasks[task_id].update({
                "current_album":      i + 1,
                "current_album_name": quiz_name,
                "current_faces":      0,
                "current_photos":     0,
            })

        db = SessionLocal()
        try:
            game_date = date_type.fromisoformat(game_date_str)

            urls = get_album_photo_urls(album_url, VK_SERVICE_KEY)
            raw  = download_photos(urls)

            quiz = get_or_create_quiz(db, quiz_name)
            game = get_or_create_game(db, quiz.id, game_date)
            db.commit()

            faces_found = 0
            for j, image_data in enumerate(raw):
                if image_data:
                    face_results: list[dict] = []
                    try:
                        orig_path, face_results = extract_faces_parallel(
                            image_data, f"vk_{j+1}.jpg", game.id, UPLOADS_DIR, FACE_DETECTION_MODEL
                        )
                        _save_faces_to_db(db, game.id, orig_path, face_results)
                        db.commit()
                    except Exception:
                        logger.exception("Batch %s: error processing photo %d of album %d", task_id, j + 1, i + 1)
                        try: db.rollback()
                        except Exception: pass
                    faces_found += len(face_results)

                with tasks_lock:
                    tasks[task_id].update({"current_faces": faces_found, "current_photos": j + 1})

            with tasks_lock:
                tasks[task_id]["results"].append({
                    "quiz_name": quiz_name,
                    "faces":     faces_found,
                    "photos":    len(urls),
                    "status":    "done",
                })
            logger.info("Batch %s: album %d/%d done (%d faces)", task_id, i + 1, len(items), faces_found)

        except Exception as exc:
            logger.exception("Batch %s: album %d failed", task_id, i + 1)
            try: db.rollback()
            except Exception: pass
            with tasks_lock:
                tasks[task_id]["results"].append({
                    "quiz_name": quiz_name,
                    "status":    "error",
                    "error":     str(exc),
                })
        finally:
            db.close()

    with tasks_lock:
        tasks[task_id]["done"] = True
    logger.info("Batch task %s done: %d albums", task_id, len(items))


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
# POST /upload  — сохранить файлы в базу, вернуть task_id
# ---------------------------------------------------------------------------

@router.post("/upload", response_model=TaskResponse)
async def upload_photos(
    files: list[UploadFile] = File(...),
    quiz_name: str = Form(..., min_length=1, max_length=255),
    game_date: date_type = Form(...),
):
    if not files:
        raise HTTPException(status_code=400, detail="At least one file is required")

    images: list[tuple[bytes, str]] = []
    for upload in files:
        if upload.content_type and upload.content_type not in ALLOWED_CONTENT_TYPES:
            continue
        data = await upload.read()
        if data:
            images.append((data, upload.filename or "photo.jpg"))

    if not images:
        raise HTTPException(status_code=400, detail="No valid image files provided")

    task_id = str(uuid_module.uuid4())
    with tasks_lock:
        tasks[task_id] = {"processed": 0, "total": len(images), "faces_found": 0, "done": False, "error": None}

    t = threading.Thread(target=_run_files_bg, args=(task_id, images, quiz_name.strip(), game_date), daemon=True)
    t.start()
    return TaskResponse(task_id=task_id)


# ---------------------------------------------------------------------------
# POST /upload-from-vk  — скачать альбом ВКонтакте, вернуть task_id
# ---------------------------------------------------------------------------

@router.post("/upload-from-vk", response_model=TaskResponse)
async def upload_from_vk(body: VkUploadRequest):
    if not VK_SERVICE_KEY:
        raise HTTPException(status_code=503, detail="VK_SERVICE_KEY не задан на сервере")

    try:
        game_date = date_type.fromisoformat(body.game_date)
    except ValueError:
        raise HTTPException(status_code=400, detail="Неверный формат даты, ожидается YYYY-MM-DD")

    task_id = str(uuid_module.uuid4())
    with tasks_lock:
        # total=0 until VK API call resolves in the background
        tasks[task_id] = {"processed": 0, "total": 0, "faces_found": 0, "done": False, "error": None}

    t = threading.Thread(
        target=_run_vk_bg,
        args=(task_id, body.album_url, body.quiz_name.strip(), game_date),
        daemon=True,
    )
    t.start()
    return TaskResponse(task_id=task_id)


# ---------------------------------------------------------------------------
# POST /upload-batch  — пакетная загрузка нескольких альбомов ВК
# ---------------------------------------------------------------------------

@router.post("/upload-batch", response_model=TaskResponse)
async def upload_batch(body: BatchUploadRequest):
    if not VK_SERVICE_KEY:
        raise HTTPException(status_code=503, detail="VK_SERVICE_KEY не задан на сервере")
    if not body.items:
        raise HTTPException(status_code=400, detail="Список альбомов пуст")

    items = [{"quiz_name": it.quiz_name.strip(), "game_date": it.game_date, "album_url": it.album_url} for it in body.items]

    task_id = str(uuid_module.uuid4())
    with tasks_lock:
        tasks[task_id] = {"total_albums": len(items), "current_album": 0, "results": [], "done": False}

    t = threading.Thread(target=_run_batch_bg, args=(task_id, items), daemon=True)
    t.start()
    return TaskResponse(task_id=task_id)


# ---------------------------------------------------------------------------
# POST /check  — проверить на совпадения, ничего не сохранять
# ---------------------------------------------------------------------------

@router.post("/check", response_model=CheckResult)
async def check_photos(
    files: list[UploadFile] = File(...),
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
                continue
            data = await upload.read()
            if data:
                images.append((data, upload.filename or "photo.jpg"))

        total, cheaters_raw = check_faces_from_images(
            images, all_data, UPLOADS_DIR, tolerance=FACE_TOLERANCE, detection_model=FACE_DETECTION_MODEL,
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
# GET /progress/{task_id}  — polling endpoint
# ---------------------------------------------------------------------------

@router.get("/progress/{task_id}")
def get_progress(task_id: str):
    with tasks_lock:
        if task_id not in tasks:
            raise HTTPException(status_code=404, detail="Task not found")
        state = dict(tasks[task_id])

    return JSONResponse(state)


# ---------------------------------------------------------------------------
# GET /faces/{filepath}
# ---------------------------------------------------------------------------

@router.get("/faces/{filepath:path}")
def serve_face(filepath: str):
    faces_base = os.path.realpath(os.path.join(UPLOADS_DIR, "faces"))
    full_path = os.path.realpath(os.path.join(faces_base, filepath))

    if not full_path.startswith(faces_base + os.sep) and full_path != faces_base:
        raise HTTPException(status_code=400, detail="Invalid path")

    if not os.path.isfile(full_path):
        raise HTTPException(status_code=404, detail="Image not found")

    return FileResponse(full_path, media_type="image/jpeg")
