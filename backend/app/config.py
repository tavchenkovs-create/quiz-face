import os

UPLOADS_DIR = os.getenv("UPLOADS_DIR", "uploads")
FACE_TOLERANCE = float(os.getenv("FACE_TOLERANCE", "0.5"))
FACE_DETECTION_MODEL = os.getenv("FACE_DETECTION_MODEL", "hog")  # "hog" (CPU) or "cnn" (GPU)
