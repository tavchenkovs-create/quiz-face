import logging
import re
from concurrent.futures import ThreadPoolExecutor

import requests

logger = logging.getLogger(__name__)

VK_API = "https://api.vk.com/method/"
VK_API_VERSION = "5.131"


def _parse_album_url(url: str) -> tuple[int, int]:
    """
    Extract (owner_id, album_id) from a VK album URL.

    Supported formats:
      https://vk.com/album-12345_67890
      https://vk.com/id123?z=album123_456
      https://vk.com/clubname?z=album-12345_67890
    """
    match = re.search(r"album(-?\d+)_(\d+)", url)
    if not match:
        raise ValueError(
            f"Не удалось распознать ссылку на альбом ВКонтакте: {url!r}. "
            "Ожидаемый формат: https://vk.com/album-XXXXX_YYYYY"
        )
    return int(match.group(1)), int(match.group(2))


def get_album_photo_urls(album_url: str, vk_token: str) -> list[str]:
    """
    Return a list of max-size photo URLs from a VK album (fast — one API call, no downloading).
    Raises ValueError on bad URL or API error.
    """
    owner_id, album_id = _parse_album_url(album_url)
    logger.info("Fetching VK album owner_id=%d album_id=%d", owner_id, album_id)

    resp = requests.get(
        f"{VK_API}photos.get",
        params={
            "owner_id":     owner_id,
            "album_id":     album_id,
            "count":        1000,
            "photo_sizes":  1,
            "v":            VK_API_VERSION,
            "access_token": vk_token,
        },
        timeout=30,
    )
    resp.raise_for_status()
    data = resp.json()

    if "error" in data:
        err = data["error"]
        raise ValueError(f"VK API вернул ошибку {err['error_code']}: {err['error_msg']}")

    items = data.get("response", {}).get("items", [])
    if not items:
        raise ValueError("Альбом пуст или недоступен")

    urls: list[str] = []
    for item in items:
        sizes = item.get("sizes", [])
        if not sizes:
            continue
        best = max(sizes, key=lambda s: s.get("width", 0) * s.get("height", 0))
        url = best.get("url")
        if url:
            urls.append(url)

    logger.info("Found %d photo URL(s) in VK album", len(urls))
    return urls


def download_photos(urls: list[str], max_workers: int = 10, timeout: int = 30) -> list[bytes | None]:
    """
    Download photos in parallel.
    Returns a list in the same order as urls; None for any photo that failed to download.
    """
    def _fetch(url: str) -> bytes | None:
        try:
            r = requests.get(url, timeout=timeout)
            r.raise_for_status()
            return r.content
        except Exception as exc:
            logger.warning("Failed to download %s: %s", url, exc)
            return None

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        return list(executor.map(_fetch, urls))


def get_album_photos(album_url: str, vk_token: str) -> list[bytes]:
    """
    Fetch all photos from a public VK album and return them as a list of bytes.
    Raises ValueError for bad URLs / API errors, requests.HTTPError for network errors.
    """
    owner_id, album_id = _parse_album_url(album_url)
    logger.info("Fetching VK album owner_id=%d album_id=%d", owner_id, album_id)

    resp = requests.get(
        f"{VK_API}photos.get",
        params={
            "owner_id":    owner_id,
            "album_id":    album_id,
            "count":       1000,
            "photo_sizes": 1,
            "v":           VK_API_VERSION,
            "access_token": vk_token,
        },
        timeout=30,
    )
    resp.raise_for_status()
    data = resp.json()

    if "error" in data:
        err = data["error"]
        raise ValueError(
            f"VK API вернул ошибку {err['error_code']}: {err['error_msg']}"
        )

    items = data.get("response", {}).get("items", [])
    if not items:
        raise ValueError("Альбом пуст или недоступен")

    logger.info("Found %d photo(s) in VK album", len(items))

    result: list[bytes] = []
    for i, item in enumerate(items):
        sizes = item.get("sizes", [])
        if not sizes:
            logger.warning("Photo %d has no sizes, skipping", i)
            continue

        # Pick the largest available size by pixel area
        best = max(sizes, key=lambda s: s.get("width", 0) * s.get("height", 0))
        url = best.get("url")
        if not url:
            continue

        try:
            photo_resp = requests.get(url, timeout=30)
            photo_resp.raise_for_status()
            result.append(photo_resp.content)
        except Exception as exc:
            logger.warning("Failed to download photo %d (%s): %s", i, url, exc)

    logger.info("Downloaded %d/%d photo(s) from VK album", len(result), len(items))
    return result
