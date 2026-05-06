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
