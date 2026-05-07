from pydantic import BaseModel


class QuizOut(BaseModel):
    id: int
    name: str

    model_config = {"from_attributes": True}


class FaceMatch(BaseModel):
    new_face_image: str
    old_face_image: str
    old_game_date: str
    old_quiz_name: str


class UploadResult(BaseModel):
    total_faces_found: int


class CheckResult(BaseModel):
    total_faces_found: int
    cheaters: list[FaceMatch]


class TaskResponse(BaseModel):
    task_id: str


class VkUploadRequest(BaseModel):
    album_url: str
    quiz_name: str
    game_date: str  # YYYY-MM-DD


class CheckFromVkRequest(BaseModel):
    album_url: str
    quiz_name: str
    tolerance: float = 0.45


class BatchItem(BaseModel):
    quiz_name: str
    game_date: str  # YYYY-MM-DD
    album_url: str


class BatchUploadRequest(BaseModel):
    items: list[BatchItem]


class VkUploadResult(BaseModel):
    total_faces_found: int
    total_photos: int
