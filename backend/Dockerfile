FROM python:3.11-slim

RUN apt-get update && apt-get install -y \
    cmake \
    gcc \
    g++ \
    libgl1-mesa-glx \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN mkdir -p uploads/originals uploads/faces

CMD uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}
