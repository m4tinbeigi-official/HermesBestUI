"""Media gallery and universal file preview/download API for HermesBestUI."""

import io
import mimetypes
import os
from pathlib import Path
import urllib.parse
import zipfile
from api.helpers import j

# Sensitive system paths that should never be exposed
BLOCKED_EXACT = {
    "/etc/shadow",
    "/etc/gshadow",
    "/etc/sudoers",
}

BLOCKED_PREFIXES = (
    "/proc",
    "/sys",
    "/dev",
)


def _is_safe_path(p: Path) -> bool:
    """Validate path access. Allow workspace, home, and standard system paths while protecting OS credentials."""
    try:
        resolved = str(p.resolve())
        if resolved in BLOCKED_EXACT:
            return False
        for pref in BLOCKED_PREFIXES:
            if resolved == pref or resolved.startswith(pref + "/"):
                return False
        # Block private SSH keys
        name = p.name.lower()
        if ("id_rsa" in name or "id_ed25519" in name or "id_ecdsa" in name) and not name.endswith(".pub"):
            return False
        return True
    except Exception:
        return False


def _resolve_target_path(raw_path: str) -> Path:
    """Resolve given path against user home, workspace, or absolute path."""
    raw = (raw_path or "").strip()
    if (raw.startswith('"') and raw.endswith('"')) or (raw.startswith("'") and raw.endswith("'")):
        raw = raw[1:-1].strip()

    p = Path(raw).expanduser()
    if not p.is_absolute():
        try:
            from api.workspace import get_last_workspace
            ws_val = get_last_workspace()
            if ws_val:
                ws = Path(ws_val).resolve()
                if (ws / p).exists():
                    return (ws / p).resolve()
        except Exception:
            pass

        # Try relative to workspace
        for candidate_root in [
            Path.home() / "workspace",
            Path("/root/workspace"),
            Path.home(),
            Path("/root"),
        ]:
            if candidate_root.exists() and (candidate_root / p).exists():
                return (candidate_root / p).resolve()

    return p.resolve()


def _serve_directory_zip(handler, dir_path: Path) -> bool:
    """Compress directory into zip stream and send as attachment."""
    try:
        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
            for root, dirs, files in os.walk(dir_path):
                dirs[:] = [d for d in dirs if d not in [".git", "node_modules", ".venv", "venv", "__pycache__"]]
                for file in files:
                    full_p = Path(root) / file
                    if full_p.is_file():
                        try:
                            rel_p = full_p.relative_to(dir_path)
                            zf.write(full_p, arcname=str(rel_p))
                        except Exception:
                            continue
        zip_bytes = zip_buffer.getvalue()
        zip_name = f"{dir_path.name or 'directory'}.zip"

        handler.send_response(200)
        handler.send_header("Content-Type", "application/zip")
        handler.send_header("Content-Length", str(len(zip_bytes)))
        handler.send_header("Content-Disposition", f'attachment; filename="{zip_name}"')
        handler.send_header("Cache-Control", "no-cache")
        handler.end_headers()
        handler.wfile.write(zip_bytes)
        return True
    except Exception as e:
        j(handler, {"error": f"Failed to compress directory: {e}"}, status=500)
        return True


def serve_file(handler, parsed, as_attachment: bool = False) -> bool:
    query = urllib.parse.parse_qs(parsed.query)
    raw_path = query.get("path", [""])[0]
    if not raw_path:
        j(handler, {"error": "Missing path parameter"}, status=400)
        return True

    p = _resolve_target_path(raw_path)
    if not p.exists():
        j(handler, {"error": f"File or directory not found: {raw_path}"}, status=404)
        return True

    if not _is_safe_path(p):
        j(handler, {"error": "Access denied to protected system path"}, status=403)
        return True

    if p.is_dir():
        if as_attachment:
            return _serve_directory_zip(handler, p)
        return handle_file_content(handler, parsed)

    try:
        content_type, _ = mimetypes.guess_type(str(p))
        ext = p.suffix.lower()

        text_exts = {
            ".py", ".sh", ".bash", ".zsh", ".js", ".ts", ".jsx", ".tsx",
            ".json", ".yaml", ".yml", ".toml", ".ini", ".conf", ".cfg", ".service",
            ".md", ".markdown", ".csv", ".tsv", ".html", ".css", ".scss", ".xml",
            ".log", ".sql", ".env", ".diff", ".patch", ".dockerignore", ".gitignore",
            ".txt", ".rst"
        }
        if not content_type or ext in text_exts:
            if ext in [".json"]:
                content_type = "application/json; charset=utf-8"
            elif ext in [".html", ".htm"] and not as_attachment:
                content_type = "text/html; charset=utf-8"
            elif ext in [".svg"]:
                content_type = "image/svg+xml"
            else:
                content_type = "text/plain; charset=utf-8"

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


def handle_file_content(handler, parsed) -> bool:
    """Return file text content or directory file listing as structured JSON."""
    query = urllib.parse.parse_qs(parsed.query)
    raw_path = query.get("path", [""])[0]
    if not raw_path:
        j(handler, {"ok": False, "error": "Missing path parameter"}, status=400)
        return True

    p = _resolve_target_path(raw_path)
    if not p.exists():
        j(handler, {"ok": False, "error": f"Path not found: {raw_path}"}, status=404)
        return True

    if not _is_safe_path(p):
        j(handler, {"ok": False, "error": "Access denied to protected path"}, status=403)
        return True

    if p.is_dir():
        entries = []
        try:
            for item in sorted(p.iterdir(), key=lambda x: (not x.is_dir(), x.name.lower())):
                if item.name.startswith(".") and item.name not in [".hermes", ".9router", ".env"]:
                    continue
                is_sub_dir = item.is_dir()
                try:
                    st = item.stat()
                    size = st.st_size if not is_sub_dir else 0
                    mtime = st.st_mtime
                except Exception:
                    size = 0
                    mtime = 0
                entries.append({
                    "name": item.name,
                    "path": str(item),
                    "is_dir": is_sub_dir,
                    "size": size,
                    "mtime": mtime
                })
        except Exception as e:
            j(handler, {"ok": False, "error": str(e)}, status=500)
            return True

        j(handler, {
            "ok": True,
            "name": p.name or str(p),
            "path": str(p),
            "is_dir": True,
            "entries": entries,
            "count": len(entries),
        })
        return True

    # It's a file
    try:
        size = p.stat().st_size
        mime, _ = mimetypes.guess_type(str(p))
        ext = p.suffix.lower()

        text_exts = {
            ".txt", ".py", ".sh", ".bash", ".zsh", ".js", ".ts", ".jsx", ".tsx",
            ".json", ".yaml", ".yml", ".toml", ".ini", ".conf", ".cfg", ".service",
            ".md", ".markdown", ".csv", ".tsv", ".html", ".css", ".scss", ".xml",
            ".log", ".sql", ".env", ".diff", ".patch", ".dockerignore", ".gitignore",
            ".rst", ".lock"
        }
        is_known_text = ext in text_exts or (mime and (mime.startswith("text/") or "json" in mime or "xml" in mime))

        if is_known_text or size < 2 * 1024 * 1024:
            try:
                with open(p, "r", encoding="utf-8", errors="replace") as f:
                    content = f.read(512 * 1024)
                    truncated = size > len(content.encode("utf-8"))
                    lines_count = content.count("\n") + 1
                    j(handler, {
                        "ok": True,
                        "name": p.name,
                        "path": str(p),
                        "is_dir": False,
                        "is_binary": False,
                        "size": size,
                        "mime": mime or "text/plain",
                        "content": content,
                        "truncated": truncated,
                        "lines_count": lines_count,
                        "ext": ext
                    })
                    return True
            except Exception:
                pass

        j(handler, {
            "ok": True,
            "name": p.name,
            "path": str(p),
            "is_dir": False,
            "is_binary": True,
            "size": size,
            "mime": mime or "application/octet-stream",
            "ext": ext
        })
        return True
    except Exception as e:
        j(handler, {"ok": False, "error": str(e)}, status=500)
        return True


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
        ".png": "image", ".jpg": "image", ".jpeg": "image", ".gif": "image", ".webp": "image", ".svg": "image",
        ".mp3": "audio", ".wav": "audio", ".ogg": "audio", ".m4a": "audio", ".aac": "audio",
        ".mp4": "video", ".webm": "video", ".mov": "video",
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


def handle_gallery_get(handler, parsed) -> bool:
    if parsed.path == "/api/gallery/items":
        items = scan_media_items()
        j(handler, {"items": items, "count": len(items)})
        return True

    if parsed.path == "/api/files/download":
        return serve_file(handler, parsed, as_attachment=True)

    if parsed.path == "/api/files/preview":
        return serve_file(handler, parsed, as_attachment=False)

    if parsed.path == "/api/files/content":
        return handle_file_content(handler, parsed)

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
            if p.is_file():
                p.unlink()
            j(handler, {"success": True, "path": str(p)})
            return True
        except Exception as e:
            j(handler, {"error": str(e)}, status=500)
            return True
    return False
