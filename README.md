# Quiz Face

Веб-приложение для распознавания лиц на фотографиях с квизов.

Организаторы загружают фото с игр — система находит людей, которые уже встречались
на предыдущих играх того же квиза, и показывает совпадения.

## Стек

| Слой | Технология |
|------|-----------|
| Бэкенд | Python 3.11+, FastAPI |
| Распознавание лиц | face_recognition (dlib) |
| База данных | SQLite + SQLAlchemy 2 |
| Фронтенд | React |
| Хостинг | Railway.app |

## Структура проекта

```
quiz-face/
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── database.py      # Подключение к БД, get_db dependency
│   │   └── models.py        # SQLAlchemy-модели
│   ├── main.py              # FastAPI-приложение
│   └── requirements.txt
├── frontend/                # React-приложение
├── uploads/                 # Загруженные фото и вырезанные лица (не в git)
│   └── faces/
├── .gitignore
└── README.md
```

## Модели БД

- **Quiz** — квиз (название)
- **Game** — одна игра квиза (дата, ссылка на Quiz)
- **Photo** — загруженная фотография (ссылка на Game)
- **FaceEncoding** — лицо, найденное на фото (128-float вектор dlib, вырезанное изображение лица)

## Локальный запуск

### Требования

- Python 3.11+
- cmake и dlib (нужны для face_recognition)
- Node.js 18+ (для фронтенда)

### Установка dlib (macOS)

```bash
brew install cmake
pip install dlib
```

### Бэкенд

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload
```

Бэкенд запустится на http://localhost:8000  
Swagger UI: http://localhost:8000/docs

### Фронтенд

```bash
cd frontend
npm install
npm start
```

Фронтенд запустится на http://localhost:3000

## Переменные окружения

Создайте `backend/.env` (пример значений):

```
DATABASE_URL=sqlite:///./quiz_face.db
CORS_ORIGINS=http://localhost:5173
UPLOADS_DIR=../uploads
FACE_TOLERANCE=0.5
FACE_DETECTION_MODEL=hog
```

Создайте `frontend/.env` (пример значений):

```
# Пусто — Vite-proxy перехватывает запросы локально
VITE_API_URL=
```

---

## Деплой на Railway

### Шаг 1

Зарегистрируйся на railway.app и создай новый проект.

### Шаг 2 — Бэкенд

- Добавь сервис из GitHub репозитория
- Укажи **Root Directory**: `backend`
- Добавь переменные окружения:
  - `FACE_TOLERANCE=0.5`
  - `FACE_DETECTION_MODEL=hog`
  - `UPLOADS_DIR=/app/uploads`

### Шаг 3 — PostgreSQL

- В том же проекте добавь плагин **PostgreSQL**
- Railway автоматически пробросит `DATABASE_URL` в бэкенд

### Шаг 4 — Фронтенд

- Добавь второй сервис из того же репозитория
- Укажи **Root Directory**: `frontend`
- Добавь переменные окружения:
  - `VITE_API_URL=https://<url-твоего-бэкенда>`

### Важно

Папка `uploads/` на Railway **эфемерна** — файлы сбрасываются при каждом деплое.
Для продакшена нужно подключить S3-совместимое хранилище (например Cloudflare R2 —
бесплатный tier 10 ГБ). Но для тестового режима это не критично.
