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
