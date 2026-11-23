#!/usr/bin/env python3
"""
Sonora local server.

Serves the static player and exposes a tiny JSON API:

  GET /api/health              -> server + library status
  GET /api/search?q=...        -> song search results (metadata + artwork)
  GET /api/song?id=...         -> metadata for a single track
  GET /api/stream/<videoId>    -> 302 redirect to the resolved audio stream

Search and metadata come from ytmusicapi; the audio stream is resolved with
yt-dlp, which handles the signature/URL negotiation that ytmusicapi does not
expose. Stream URLs are cached until shortly before they expire.

Run:  python server.py [port]
"""

from __future__ import annotations

import json
import os
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

import yt_dlp
from ytmusicapi import YTMusic

ROOT = os.path.dirname(os.path.abspath(__file__))
PORT = int(sys.argv[1] if len(sys.argv) > 1 else os.environ.get("PORT", "8787"))

SEARCH_TTL = 300
STREAM_TTL = 2400

MIME_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".ico": "image/x-icon",
    ".txt": "text/plain; charset=utf-8",
    ".md": "text/markdown; charset=utf-8",
}

_ytmusic: YTMusic | None = None
_yt_lock = threading.Lock()
_cache_lock = threading.Lock()
_search_cache: dict[tuple[str, int], tuple[float, list]] = {}
_stream_cache: dict[str, tuple[str, float]] = {}
_extract_lock = threading.Lock()


def ytmusic() -> YTMusic:
    global _ytmusic
    with _yt_lock:
        if _ytmusic is None:
            _ytmusic = YTMusic()
        return _ytmusic


def best_thumbnail(thumbnails) -> str:
    if not thumbnails:
        return ""
    ordered = sorted(thumbnails, key=lambda item: item.get("width") or 0, reverse=True)
    return ordered[0].get("url", "")


def normalize_track(item: dict) -> dict | None:
    video_id = item.get("videoId")
    if not video_id:
        return None

    artists = item.get("artists") or []
    artist = ", ".join(a.get("name", "") for a in artists if a.get("name"))

    album = item.get("album")
    album_name = album.get("name", "") if isinstance(album, dict) else ""

    duration = item.get("duration_seconds")
    if duration is None and item.get("duration"):
        duration = item.get("duration")

    return {
        "id": video_id,
        "title": item.get("title") or "Unknown title",
        "artist": artist or item.get("author") or "Unknown artist",
        "album": album_name,
        "duration": int(duration) if isinstance(duration, (int, float)) else 0,
        "artwork": best_thumbnail(item.get("thumbnails")),
    }


def search_songs(query: str, limit: int) -> list[dict]:
    key = (query.lower(), limit)
    now = time.time()

    with _cache_lock:
        cached = _search_cache.get(key)
        if cached and now - cached[0] < SEARCH_TTL:
            return cached[1]

    raw = ytmusic().search(query, filter="songs", limit=limit)
    songs = []
    seen = set()
    for item in raw or []:
        track = normalize_track(item)
        if not track or track["id"] in seen:
            continue
        seen.add(track["id"])
        songs.append(track)
        if len(songs) >= limit:
            break

    with _cache_lock:
        _search_cache[key] = (time.time(), songs)
    return songs


def song_details(video_id: str) -> dict:
    data = ytmusic().get_song(video_id)
    details = data.get("videoDetails") or {}
    playability = data.get("playabilityStatus") or {}

    if playability.get("status") not in (None, "OK"):
        raise RuntimeError(playability.get("reason") or "Track is not playable")

    micro = (data.get("microformat") or {}).get("microformatDataRenderer") or {}
    title = details.get("title") or micro.get("title") or "Unknown title"
    artist = details.get("author") or ""
    length = details.get("lengthSeconds")

    return {
        "id": video_id,
        "title": title,
        "artist": artist,
        "duration": int(length) if length and str(length).isdigit() else 0,
        "artwork": best_thumbnail((details.get("thumbnail") or {}).get("thumbnails")),
        "stream": f"/api/stream/{video_id}",
    }


def resolve_stream(video_id: str) -> str:
    now = time.time()
    with _cache_lock:
        cached = _stream_cache.get(video_id)
        if cached and cached[1] > now:
            return cached[0]

    options = {
        "quiet": True,
        "no_warnings": True,
        "noplaylist": True,
        "format": "bestaudio[ext=m4a]/bestaudio/best",
        "nocheckcertificate": True,
    }

    with _extract_lock:
        with yt_dlp.YoutubeDL(options) as downloader:
            info = downloader.extract_info(
                f"https://music.youtube.com/watch?v={video_id}", download=False
            )

    url = info.get("url")
    if not url:
        raise RuntimeError("No audio stream returned")

    with _cache_lock:
        _stream_cache[video_id] = (url, time.time() + STREAM_TTL)
    return url


class Handler(BaseHTTPRequestHandler):
    server_version = "Sonora/1.0"

    def do_GET(self) -> None:  # noqa: N802
        self.dispatch(head=False)

    def do_HEAD(self) -> None:  # noqa: N802
        self.dispatch(head=True)

    def log_message(self, fmt: str, *args) -> None:
        sys.stderr.write("[sonora] " + (fmt % args) + "\n")

    def dispatch(self, head: bool) -> None:
        parsed = urlparse(self.path)
        path = parsed.path
        query = parse_qs(parsed.query)

        if path.startswith("/api/"):
            try:
                self.handle_api(path, query, head)
            except Exception as error:  # keep the API honest instead of hanging
                self.send_json({"error": str(error)}, status=502, head=head)
            return

        self.serve_static(path, head)

    # ---------------- API ----------------

    def handle_api(self, path: str, query: dict, head: bool) -> None:
        if path == "/api/health":
            self.send_json(
                {
                    "ok": True,
                    "search": True,
                    "stream": True,
                    "cachedStreams": len(_stream_cache),
                    "time": int(time.time()),
                },
                head=head,
            )
            return

        if path == "/api/search":
            term = (query.get("q") or [""])[0].strip()
            if not term:
                self.send_json({"error": "Missing q parameter", "songs": []}, status=400, head=head)
                return
            limit = min(40, max(1, int((query.get("limit") or ["24"])[0])))
            songs = search_songs(term, limit)
            self.send_json({"songs": songs, "query": term}, head=head)
            return

        if path == "/api/song":
            video_id = (query.get("id") or [""])[0].strip()
            if not video_id:
                self.send_json({"error": "Missing id parameter"}, status=400, head=head)
                return
            self.send_json(song_details(video_id), head=head)
            return

        if path.startswith("/api/stream/"):
            video_id = path.rsplit("/", 1)[-1].strip()
            if not video_id:
                self.send_json({"error": "Missing video id"}, status=400, head=head)
                return
            url = resolve_stream(video_id)
            self.send_response(302)
            self.send_header("Location", url)
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            return

        self.send_json({"error": "Unknown endpoint"}, status=404, head=head)

    # ---------------- static ----------------

    def serve_static(self, path: str, head: bool) -> None:
        relative = "index.html" if path in ("/", "") else path.lstrip("/")
        target = os.path.realpath(os.path.join(ROOT, relative))

        if not target.startswith(ROOT) or not os.path.isfile(target):
            self.send_json({"error": "Not found"}, status=404, head=head)
            return

        _, extension = os.path.splitext(target)
        content_type = MIME_TYPES.get(extension.lower(), "application/octet-stream")

        with open(target, "rb") as handle:
            body = handle.read()

        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        if not head:
            self.wfile.write(body)

    # ---------------- helpers ----------------

    def send_json(self, payload: dict, status: int = 200, head: bool = False) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        if not head:
            self.wfile.write(body)


def main() -> None:
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print(f"Sonora running at http://127.0.0.1:{PORT}")
    print("Ctrl+C to stop.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
