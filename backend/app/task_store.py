import threading

# In-memory task registry: task_id -> {processed, total, faces_found, done, error, total_photos}
tasks: dict[str, dict] = {}
tasks_lock = threading.Lock()
