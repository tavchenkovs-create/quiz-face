import logging
import os
import uuid
from datetime import date
from io import BytesIO

import face_recognition
import numpy as np
from PIL import Image, ImageOps
from sqlalchemy.orm import Session

from .models import FaceEncoding, Game, Photo, Quiz

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Quiz / Game helpers
# ---------------------------------------------------------------------------

def get_or_create_quiz(db: Session, quiz_name: str) -> Quiz:
    quiz = db.query(Quiz).filter(Quiz.name == quiz_name).first()
    if not quiz:
        quiz = Quiz(name=quiz_name)
        db.add(quiz)
        db.flush()
        logger.info("Created quiz %r (id=%d)", quiz_name, quiz.id)
    return quiz


def get_or_create_game(db: Session, quiz_id: int, game_date: date) -> Game:
    game = db.query(Game).filter(Game.quiz_id == quiz_id, Game.date == game_date).first()
    if not game:
        game = Game(quiz_id=quiz_id, date=game_date)
        db.add(game)
        db.flush()
        logger.info("Created game id=%d for quiz_id=%d on %s", game.id, quiz_id, game_date)
    return game


# ---------------------------------------------------------------------------
# Historical face data
# ---------------------------------------------------------------------------

def load_old_faces(db: Session, quiz_id: int, current_game_id: int) -> list[tuple]:
    """Return (FaceEncoding, Game, Quiz) rows from all games of quiz except current."""
    rows = (
        db.query(FaceEncoding, Game, Quiz)
        .join(Photo, FaceEncoding.photo_id == Photo.id)
        .join(Game, Photo.game_id == Game.id)
        .join(Quiz, Game.quiz_id == Quiz.id)
        .filter(Game.quiz_id == quiz_id, Game.id != current_game_id)
        .all()
    )
    logger.info(
        "Loaded %d historical face(s) from quiz_id=%d (excluding game_id=%d)",
        len(rows), quiz_id, current_game_id,
    )
    return rows


def load_all_quiz_faces(db: Session, quiz_id: int) -> list[tuple]:
    """Return all (FaceEncoding, Game, Quiz) rows for the quiz."""
    rows = (
        db.query(FaceEncoding, Game, Quiz)
        .join(Photo, FaceEncoding.photo_id == Photo.id)
        .join(Game, Photo.game_id == Game.id)
        .join(Quiz, Game.quiz_id == Quiz.id)
        .filter(Game.quiz_id == quiz_id)
        .all()
    )
    logger.info("Loaded %d face(s) from quiz_id=%d", len(rows), quiz_id)
    return rows


# ---------------------------------------------------------------------------
# Photo processing
# ---------------------------------------------------------------------------

def process_photo(
    db: Session,
    image_data: bytes,
    original_filename: str,
    game: Game,
    uploads_dir: str,
    detection_model: str = "hog",
) -> list[FaceEncoding]:
    """
    Save the original, extract all faces, persist crops + encodings.
    Returns the newly created FaceEncoding rows (IDs set via flush).
    """
    # --- save original --------------------------------------------------
    originals_dir = os.path.join(uploads_dir, "originals", str(game.id))
    os.makedirs(originals_dir, exist_ok=True)
    safe_name = f"{uuid.uuid4()}_{os.path.basename(original_filename)}"
    with open(os.path.join(originals_dir, safe_name), "wb") as fh:
        fh.write(image_data)

    photo = Photo(game_id=game.id, filename=f"originals/{game.id}/{safe_name}")
    db.add(photo)
    db.flush()  # need photo.id before creating FaceEncoding rows

    # --- decode image ---------------------------------------------------
    try:
        pil_image = ImageOps.exif_transpose(
            Image.open(BytesIO(image_data)).convert("RGB")
        )
    except Exception as exc:
        logger.warning("Cannot open %r: %s", original_filename, exc)
        return []

    np_image = np.array(pil_image)
    logger.info(
        "Processing %r (%dx%d)", original_filename, np_image.shape[1], np_image.shape[0]
    )

    # --- detect + encode faces -----------------------------------------
    try:
        locations = face_recognition.face_locations(np_image, model=detection_model)
    except Exception as exc:
        logger.warning("face_locations failed for %r: %s", original_filename, exc)
        return []

    if not locations:
        logger.info("No faces found in %r", original_filename)
        return []

    logger.info("Found %d face(s) in %r", len(locations), original_filename)

    try:
        encodings = face_recognition.face_encodings(np_image, locations)
    except Exception as exc:
        logger.warning("face_encodings failed for %r: %s", original_filename, exc)
        return []

    # --- crop & save each face -----------------------------------------
    faces_dir = os.path.join(uploads_dir, "faces", str(game.id))
    os.makedirs(faces_dir, exist_ok=True)

    new_records: list[FaceEncoding] = []
    for top, right, bottom, left in locations:
        encoding = encodings[len(new_records)]

        # add padding so the crop doesn't cut into the face
        pad = 20
        h, w = np_image.shape[:2]
        crop_top = max(0, top - pad)
        crop_left = max(0, left - pad)
        crop_bottom = min(h, bottom + pad)
        crop_right = min(w, right + pad)

        face_crop = pil_image.crop((crop_left, crop_top, crop_right, crop_bottom))
        face_filename = f"{uuid.uuid4()}.jpg"
        face_crop.save(os.path.join(faces_dir, face_filename), "JPEG", quality=90)

        record = FaceEncoding(
            photo_id=photo.id,
            encoding=encoding.tobytes(),          # 128 × float64 = 1024 bytes
            face_image_filename=f"{game.id}/{face_filename}",
        )
        db.add(record)
        new_records.append(record)

    db.flush()  # assign IDs to all new records at once
    logger.info("Saved %d face encoding(s) from %r", len(new_records), original_filename)
    return new_records


# ---------------------------------------------------------------------------
# Parallel-safe photo processing (no DB access)
# ---------------------------------------------------------------------------

def extract_faces_parallel(
    image_data: bytes,
    filename: str,
    game_id: int,
    uploads_dir: str,
    detection_model: str = "hog",
) -> tuple[str, list[dict]]:
    """
    Save original + detect faces + save crops — no DB access.
    Safe to call from multiple threads concurrently.
    Returns (original_relative_path, [{face_image_filename, encoding_bytes}]).
    """
    originals_dir = os.path.join(uploads_dir, "originals", str(game_id))
    os.makedirs(originals_dir, exist_ok=True)
    safe_name = f"{uuid.uuid4()}_{os.path.basename(filename)}"
    with open(os.path.join(originals_dir, safe_name), "wb") as fh:
        fh.write(image_data)
    original_relative = f"originals/{game_id}/{safe_name}"

    try:
        pil_image = ImageOps.exif_transpose(Image.open(BytesIO(image_data)).convert("RGB"))
    except Exception as exc:
        logger.warning("Cannot open %r: %s", filename, exc)
        return original_relative, []

    if max(pil_image.size) > 1200:
        pil_image.thumbnail((1200, 1200), Image.LANCZOS)

    np_image = np.array(pil_image)
    logger.info("Processing %r (%dx%d)", filename, np_image.shape[1], np_image.shape[0])

    try:
        locations = face_recognition.face_locations(np_image, model=detection_model)
    except Exception as exc:
        logger.warning("face_locations failed for %r: %s", filename, exc)
        return original_relative, []

    if not locations:
        logger.info("No faces in %r", filename)
        return original_relative, []

    try:
        encodings = face_recognition.face_encodings(np_image, locations)
    except Exception as exc:
        logger.warning("face_encodings failed for %r: %s", filename, exc)
        return original_relative, []

    faces_dir = os.path.join(uploads_dir, "faces", str(game_id))
    os.makedirs(faces_dir, exist_ok=True)

    results: list[dict] = []
    for (top, right, bottom, left), encoding in zip(locations, encodings):
        pad = 20
        h, w = np_image.shape[:2]
        crop = pil_image.crop((max(0,left-pad), max(0,top-pad), min(w,right+pad), min(h,bottom+pad)))
        face_filename = f"{uuid.uuid4()}.jpg"
        crop.save(os.path.join(faces_dir, face_filename), "JPEG", quality=90)
        results.append({
            "face_image_filename": f"{game_id}/{face_filename}",
            "encoding_bytes": encoding.tobytes(),
        })

    logger.info("Extracted %d face(s) from %r", len(results), filename)
    return original_relative, results


# ---------------------------------------------------------------------------
# Face matching
# ---------------------------------------------------------------------------

def find_matches(
    new_faces: list[FaceEncoding],
    old_data: list[tuple],   # (FaceEncoding, Game, Quiz)
    tolerance: float = 0.5,
) -> list[dict]:
    """
    Compare each new face encoding against all historical faces.
    Returns a list of match dicts with URL paths for both images.
    """
    if not new_faces or not old_data:
        return []

    old_encodings = [
        np.frombuffer(enc.encoding, dtype=np.float64)
        for enc, _game, _quiz in old_data
    ]

    matches: list[dict] = []
    seen_pairs: set[tuple[int, int]] = set()

    for new_face in new_faces:
        new_enc = np.frombuffer(new_face.encoding, dtype=np.float64)
        results = face_recognition.compare_faces(old_encodings, new_enc, tolerance=tolerance)

        for matched, (old_face, old_game, old_quiz) in zip(results, old_data):
            if not matched:
                continue
            pair = (new_face.id, old_face.id)
            if pair in seen_pairs:
                continue
            seen_pairs.add(pair)

            matches.append({
                "new_face_image": f"/faces/{new_face.face_image_filename}",
                "old_face_image": f"/faces/{old_face.face_image_filename}",
                "old_game_date": str(old_game.date),
                "old_quiz_name": old_quiz.name,
            })
            logger.info(
                "Match: new face %d <-> old face %d from %s",
                new_face.id, old_face.id, old_game.date,
            )

    logger.info("Total matches found: %d", len(matches))
    return matches


# ---------------------------------------------------------------------------
# Check without saving
# ---------------------------------------------------------------------------

def check_faces_from_images(
    images: list[tuple[bytes, str]],   # (image_data, filename)
    all_quiz_data: list[tuple],         # (FaceEncoding, Game, Quiz)
    uploads_dir: str,
    tolerance: float = 0.5,
    detection_model: str = "hog",
) -> tuple[int, list[dict]]:
    """
    Extract faces from raw images and compare against all_quiz_data.
    Saves temporary crops to uploads/faces/tmp/ for display.
    Nothing is written to the database.
    Returns (total_faces_found, matches).
    """
    tmp_dir = os.path.join(uploads_dir, "faces", "tmp")
    os.makedirs(tmp_dir, exist_ok=True)

    new_faces: list[tuple[np.ndarray, str]] = []  # (encoding, /faces/tmp/uuid.jpg)

    for image_data, filename in images:
        try:
            pil_image = ImageOps.exif_transpose(
                Image.open(BytesIO(image_data)).convert("RGB")
            )
        except Exception as exc:
            logger.warning("Cannot open %r: %s", filename, exc)
            continue

        np_image = np.array(pil_image)
        logger.info("Checking %r (%dx%d)", filename, np_image.shape[1], np_image.shape[0])

        try:
            locations = face_recognition.face_locations(np_image, model=detection_model)
        except Exception as exc:
            logger.warning("face_locations failed for %r: %s", filename, exc)
            continue

        if not locations:
            logger.info("No faces in %r", filename)
            continue

        try:
            encodings = face_recognition.face_encodings(np_image, locations)
        except Exception as exc:
            logger.warning("face_encodings failed for %r: %s", filename, exc)
            continue

        logger.info("Found %d face(s) in %r", len(locations), filename)

        for (top, right, bottom, left), encoding in zip(locations, encodings):
            pad = 20
            h, w = np_image.shape[:2]
            crop = pil_image.crop((
                max(0, left - pad), max(0, top - pad),
                min(w, right + pad), min(h, bottom + pad),
            ))
            face_filename = f"{uuid.uuid4()}.jpg"
            crop.save(os.path.join(tmp_dir, face_filename), "JPEG", quality=90)
            new_faces.append((encoding, f"/faces/tmp/{face_filename}"))

    logger.info("Extracted %d face(s) for check", len(new_faces))

    if not new_faces or not all_quiz_data:
        return len(new_faces), []

    old_encodings = [
        np.frombuffer(enc.encoding, dtype=np.float64)
        for enc, _game, _quiz in all_quiz_data
    ]

    matches: list[dict] = []
    seen: set[tuple] = set()

    for new_enc, new_url in new_faces:
        results = face_recognition.compare_faces(old_encodings, new_enc, tolerance=tolerance)

        for matched, (old_face, old_game, old_quiz) in zip(results, all_quiz_data):
            if not matched:
                continue
            pair = (new_url, old_face.id)
            if pair in seen:
                continue
            seen.add(pair)

            matches.append({
                "new_face_image": new_url,
                "old_face_image": f"/faces/{old_face.face_image_filename}",
                "old_game_date": str(old_game.date),
                "old_quiz_name": old_quiz.name,
            })
            logger.info("Check match: %s <-> old face %d from %s", new_url, old_face.id, old_game.date)

    logger.info("Check found %d match(es)", len(matches))
    return len(new_faces), matches


# ---------------------------------------------------------------------------
# Check without saving — with per-image progress callback
# ---------------------------------------------------------------------------

def check_faces_with_progress(
    images: list[tuple[bytes, str]],
    all_quiz_data: list[tuple],
    uploads_dir: str,
    tolerance: float = 0.5,
    detection_model: str = "hog",
    progress_cb=None,
) -> tuple[int, list[dict]]:
    """
    Same as check_faces_from_images but calls progress_cb(processed, total, faces_found)
    after every image so callers can track progress asynchronously.
    """
    tmp_dir = os.path.join(uploads_dir, "faces", "tmp")
    os.makedirs(tmp_dir, exist_ok=True)
    total = len(images)
    new_faces: list[tuple[np.ndarray, str]] = []

    for idx, (image_data, filename) in enumerate(images):
        try:
            pil_image = ImageOps.exif_transpose(Image.open(BytesIO(image_data)).convert("RGB"))
            if max(pil_image.size) > 1200:
                pil_image.thumbnail((1200, 1200), Image.LANCZOS)
        except Exception as exc:
            logger.warning("Cannot open %r: %s", filename, exc)
            if progress_cb: progress_cb(idx + 1, total, len(new_faces))
            continue

        np_image = np.array(pil_image)
        try:
            locations = face_recognition.face_locations(np_image, model=detection_model)
        except Exception as exc:
            logger.warning("face_locations failed for %r: %s", filename, exc)
            if progress_cb: progress_cb(idx + 1, total, len(new_faces))
            continue

        if not locations:
            if progress_cb: progress_cb(idx + 1, total, len(new_faces))
            continue

        try:
            encodings = face_recognition.face_encodings(np_image, locations)
        except Exception as exc:
            logger.warning("face_encodings failed for %r: %s", filename, exc)
            if progress_cb: progress_cb(idx + 1, total, len(new_faces))
            continue

        for (top, right, bottom, left), encoding in zip(locations, encodings):
            pad = 20
            h, w = np_image.shape[:2]
            crop = pil_image.crop((max(0, left-pad), max(0, top-pad), min(w, right+pad), min(h, bottom+pad)))
            face_filename = f"{uuid.uuid4()}.jpg"
            crop.save(os.path.join(tmp_dir, face_filename), "JPEG", quality=90)
            new_faces.append((encoding, f"/faces/tmp/{face_filename}"))

        if progress_cb: progress_cb(idx + 1, total, len(new_faces))

    logger.info("Extracted %d face(s) for progressive check", len(new_faces))

    if not new_faces or not all_quiz_data:
        return len(new_faces), []

    old_encodings = [np.frombuffer(enc.encoding, dtype=np.float64) for enc, _, _ in all_quiz_data]
    matches: list[dict] = []
    seen: set[tuple] = set()

    for new_enc, new_url in new_faces:
        results = face_recognition.compare_faces(old_encodings, new_enc, tolerance=tolerance)
        for matched, (old_face, old_game, old_quiz) in zip(results, all_quiz_data):
            if not matched: continue
            pair = (new_url, old_face.id)
            if pair in seen: continue
            seen.add(pair)
            matches.append({
                "new_face_image": new_url,
                "old_face_image": f"/faces/{old_face.face_image_filename}",
                "old_game_date":  str(old_game.date),
                "old_quiz_name":  old_quiz.name,
            })

    logger.info("Progressive check found %d match(es)", len(matches))
    return len(new_faces), matches
