"""Media gallery and file preview/download API for Hermes WebUI."""

import mimetypes
import os
from pathlib import Path
import urllib.parse
from api.helpers import j

ALLOWED_ROOTS = [
    Path.home() / ".hermes",
    Path.home() / "workspace",
    Path.home() / "Desktop",
    Path.home() / "Downloads",
]


def _is_safe_path(p: Path) -> bool:
    try:
        resolved = p.resolve()
        for root in ALLOWED_ROOTS:
            try:
                resolved.relative_to(root.resolve())
                return True
            except ValueError:
                continue
    except Exception:
        pass
    return False


def scan_media_items() -> list[dict]:
    """Scan Hermes and workspace directories for audio, image, and generated media files."""
    scan_dirs = [
        Path.home() / ".hermes" / "audio_cache",
        Path.home() / ".hermes" / "image_cache",
        Path.home() / ".hermes" / "cache" / "scratch",
        Path.home() / "voice-memos",
        Path.home() / "workspace" / "media-assets",
        Path.home() / "workspace" / "data-and-reports",
        Path.home() / "workspace" / "projects",
        Path.home() / "workspace" / "clients-and-collaborations",
    ]
    media_extensions = {
        # images
        ".png": "image", ".jpg": "image", ".jpeg": "image", ".gif": "image", ".webp": "image", ".svg": "image",
        # audio
        ".mp3": "audio", ".wav": "audio", ".ogg": "audio", ".m4a": "audio", ".aac": "audio",
        # video
        ".mp4": "video", ".webm": "video", ".mov": "video",
        # docs / text
        ".pdf": "document", ".csv": "document", ".json": "document", ".txt": "document",
    }
    items = []
    seen = set()

    for d in scan_dirs:
        if not d.exists() or not d.is_dir():
            continue
        try:
            for root, _, files in os.walk(d):
                if any(ignored in root for ignored in ["node_modules", ".git", ".venv", "venv", "__pycache__"]):
                    continue
                for f in files:
                    if f.startswith("."):
                        continue
                    ext = Path(f).suffix.lower()
                    if ext in media_extensions:
                        full_path = Path(root) / f
                        if full_path in seen:
                            continue
                        seen.add(full_path)
                        try:
                            stat = full_path.stat()
                            items.append({
                                "name": f,
                                "path": str(full_path),
                                "size": stat.st_size,
                                "mtime": stat.st_mtime,
                                "type": media_extensions[ext],
                                "ext": ext,
                            })
                        except Exception:
                            continue
        except Exception:
            continue

    items.sort(key=lambda x: x["mtime"], reverse=True)
    return items


def _resolve_target_path(raw_path: str) -> Path:
    p = Path(raw_path).expanduser()
    if not p.is_absolute():
        try:
            from api.workspace import get_last_workspace
            ws = Path(get_last_workspace()).resolve()
            if (ws / p).exists():
                return (ws / p).resolve()
        except Exception:
            pass
        fallback = (Path.home() / "workspace" / raw_path).resolve()
        if fallback.exists():
            return fallback
    return p.resolve()


def serve_file(handler, parsed, as_attachment: bool = False) -> bool:
    query = urllib.parse.parse_qs(parsed.query)
    raw_path = query.get("path", [""])[0]
    if not raw_path:
        j(handler, {"error": "Missing path parameter"}, status=400)
        return True

    p = _resolve_target_path(raw_path)
    if not p.exists() or not p.is_file():
        j(handler, {"error": "File not found"}, status=404)
        return True

    if not _is_safe_path(p):
        j(handler, {"error": "Access denied to path outside workspace/hermes"}, status=403)
        return True

    try:
        content_type, _ = mimetypes.guess_type(str(p))
        if not content_type:
            content_type = "application/octet-stream"

        size = p.stat().st_size
        handler.send_response(200)
        handler.send_header("Content-Type", content_type)
        handler.send_header("Content-Length", str(size))
        filename = p.name.replace('"', "")
        disposition = "attachment" if as_attachment else "inline"
        handler.send_header("Content-Disposition", f'{disposition}; filename="{filename}"')
        handler.send_header("Cache-Control", "no-cache")
        handler.end_headers()

        with open(p, "rb") as f:
            while chunk := f.read(64 * 1024):
                handler.wfile.write(chunk)
        return True
    except Exception as e:
        j(handler, {"error": str(e)}, status=500)
        return True


def handle_gallery_get(handler, parsed) -> bool:
    if parsed.path == "/api/gallery/items":
        items = scan_media_items()
        j(handler, {"items": items, "count": len(items)})
        return True

    if parsed.path == "/api/files/download":
        return serve_file(handler, parsed, as_attachment=True)

    if parsed.path == "/api/files/preview":
        return serve_file(handler, parsed, as_attachment=False)

    return False


def handle_gallery_delete(handler, parsed) -> bool:
    if parsed.path == "/api/gallery/item":
        query = urllib.parse.parse_qs(parsed.query)
        raw_path = query.get("path", [""])[0]
        if not raw_path:
            j(handler, {"error": "Missing path parameter"}, status=400)
            return True
        p = _resolve_target_path(raw_path)
        if not p.exists():
            j(handler, {"error": "File not found"}, status=404)
            return True
        if not _is_safe_path(p):
            j(handler, {"error": "Access denied"}, status=403)
            return True
        try:
            p.unlink()
            j(handler, {"success": True, "path": str(p)})
            return True
        except Exception as e:
            j(handler, {"error": str(e)}, status=500)
            return True
    return False
