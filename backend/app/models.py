from datetime import datetime, date as date_type
from sqlalchemy import Integer, String, Date, DateTime, ForeignKey, LargeBinary
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


class Quiz(Base):
    __tablename__ = "quizzes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)

    games: Mapped[list["Game"]] = relationship("Game", back_populates="quiz")


class Game(Base):
    __tablename__ = "games"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    quiz_id: Mapped[int] = mapped_column(Integer, ForeignKey("quizzes.id"), nullable=False)
    date: Mapped[date_type] = mapped_column(Date, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    quiz: Mapped["Quiz"] = relationship("Quiz", back_populates="games")
    photos: Mapped[list["Photo"]] = relationship("Photo", back_populates="game")


class Photo(Base):
    __tablename__ = "photos"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    game_id: Mapped[int] = mapped_column(Integer, ForeignKey("games.id"), nullable=False)
    filename: Mapped[str] = mapped_column(String(512), nullable=False)
    uploaded_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    game: Mapped["Game"] = relationship("Game", back_populates="photos")
    face_encodings: Mapped[list["FaceEncoding"]] = relationship("FaceEncoding", back_populates="photo")


class FaceEncoding(Base):
    __tablename__ = "face_encodings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    photo_id: Mapped[int] = mapped_column(Integer, ForeignKey("photos.id"), nullable=False)
    # 128-float face_recognition vector, serialised with numpy.tobytes()
    encoding: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    face_image_filename: Mapped[str] = mapped_column(String(512), nullable=False)

    photo: Mapped["Photo"] = relationship("Photo", back_populates="face_encodings")
