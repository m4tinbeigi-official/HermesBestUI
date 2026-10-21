"""9Router management and proxy API for Hermes WebUI."""

import hashlib
import json
import logging
import os
from pathlib import Path
import urllib.error
import urllib.parse
import urllib.request
from api.helpers import j

logger = logging.getLogger("hermes.9router")

NINEROUTER_BASE_URL = "http://127.0.0.1:20128"


def get_9router_cli_token() -> str:
    """Compute 9router CLI auth token from machine-id and auth secret."""
    try:
        data_dir = Path.home() / ".9router"
        machine_file = data_dir / "machine-id"
        secret_file = data_dir / "auth" / "cli-secret"
        if not machine_file.exists():
            return ""
        machine_id = machine_file.read_text().strip()
        cli_secret = secret_file.read_text().strip() if secret_file.exists() else ""
        return hashlib.sha256((machine_id + "9r-cli-auth" + cli_secret).encode("utf-8")).hexdigest()[:16]
    except Exception as e:
        logger.debug("Failed to compute 9router CLI token: %s", e)
        return ""


def _ninerouter_request(method: str, path: str, body: dict | None = None, timeout: float = 12.0) -> tuple[int, dict]:
    """Execute HTTP request to local 9router daemon."""
    url = f"{NINEROUTER_BASE_URL}{path}"
    headers = {
        "x-9r-cli-token": get_9router_cli_token(),
        "Accept": "application/json",
    }
    data_bytes = None
    if body is not None:
        data_bytes = json.dumps(body).encode("utf-8")
        headers["Content-Type"] = "application/json"

    req = urllib.request.Request(url, data=data_bytes, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8")
            status = resp.status
            try:
                parsed = json.loads(raw) if raw else {}
            except Exception:
                parsed = {"raw": raw}
            return status, parsed
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", errors="replace")
        try:
            parsed = json.loads(raw) if raw else {}
        except Exception:
            parsed = {"error": raw or f"HTTP {e.code}"}
        return e.code, parsed
    except Exception as e:
        return 503, {"error": str(e), "offline": True}


def is_9router_running() -> bool:
    """Check if 9router server is currently listening on port 20128."""
    status, _ = _ninerouter_request("GET", "/api/providers", timeout=2.0)
    return status in (200, 401, 403)


def is_hermes_using_9router() -> bool:
    """Check if Hermes is currently configured to use 9router."""
    try:
        config_path = Path.home() / ".hermes" / "config.yaml"
        if not config_path.exists():
            return False
        content = config_path.read_text(encoding="utf-8")
        return "20128" in content or "custom:9router" in content or "9router" in content
    except Exception:
        return False


def get_hermes_active_model() -> str:
    """Get active model configured in Hermes."""
    try:
        config_path = Path.home() / ".hermes" / "config.yaml"
        if not config_path.exists():
            return ""
        import yaml
        cfg = yaml.safe_load(config_path.read_text(encoding="utf-8")) or {}
        return cfg.get("model", {}).get("default", "")
    except Exception:
        return ""


def set_hermes_active_model(model_name: str) -> dict:
    """Update active model in Hermes config.yaml."""
    try:
        config_path = Path.home() / ".hermes" / "config.yaml"
        import yaml
        cfg = {}
        if config_path.exists():
            cfg = yaml.safe_load(config_path.read_text(encoding="utf-8")) or {}

        if "model" not in cfg or not isinstance(cfg["model"], dict):
            cfg["model"] = {}

        cfg["model"]["default"] = model_name
        cfg["model"]["provider"] = "custom:9router"
        cfg["model"]["base_url"] = "http://127.0.0.1:20128/v1"

        config_path.write_text(yaml.safe_dump(cfg, sort_keys=False, allow_unicode=True), encoding="utf-8")
        return {"success": True, "model": model_name}
    except Exception as e:
        return {"success": False, "error": str(e)}


def kickstart_9router_service() -> dict:
    """Kickstart 9router launchd daemon to clear in-memory quota blocks & 429 cache."""
    try:
        import subprocess
        uid = os.getuid()
        cmd = f"launchctl kickstart -k gui/{uid}/ai.hermes.9router"
        res = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=10)
        if res.returncode == 0:
            return {"success": True, "message": "9Router daemon kickstarted successfully."}
        subprocess.run("pkill -f 'node.*9router' || true", shell=True, timeout=5)
        return {"success": True, "message": "Process reloaded via signal."}
    except Exception as e:
        logger.exception("Failed to kickstart 9router: %s", e)
        return {"success": False, "error": str(e)}


def connect_hermes_to_9router(default_model: str = "ag/gemini-3.8-flash-medium") -> dict:
    """Configure Hermes config.yaml to use 9router."""
    try:
        config_path = Path.home() / ".hermes" / "config.yaml"
        import yaml
        cfg = {}
        if config_path.exists():
            try:
                cfg = yaml.safe_load(config_path.read_text(encoding="utf-8")) or {}
            except Exception:
                cfg = {}

        if "model" not in cfg or not isinstance(cfg["model"], dict):
            cfg["model"] = {}

        cfg["model"]["base_url"] = "http://127.0.0.1:20128/v1"
        cfg["model"]["provider"] = "custom:9router"
        if default_model:
            cfg["model"]["default"] = default_model
        if not cfg["model"].get("api_key"):
            cfg["model"]["api_key"] = "sk-9router-local"

        if "providers" not in cfg or not isinstance(cfg["providers"], dict):
            cfg["providers"] = {}
        cfg["providers"]["9router"] = {
            "api": "http://127.0.0.1:20128/v1",
            "base_url": "http://127.0.0.1:20128/v1",
            "api_key": cfg["model"].get("api_key", "sk-9router-local"),
        }

        # Ensure custom_providers entry exists
        custom_providers = cfg.get("custom_providers", [])
        if not isinstance(custom_providers, list):
            custom_providers = []
        found = False
        for cp in custom_providers:
            if isinstance(cp, dict) and cp.get("name") == "9router":
                cp["base_url"] = "http://127.0.0.1:20128/v1"
                found = True
                break
        if not found:
            custom_providers.append({
                "name": "9router",
                "base_url": "http://127.0.0.1:20128/v1",
                "api_key": cfg["model"].get("api_key", "sk-9router-local"),
                "model": default_model,
            })
        cfg["custom_providers"] = custom_providers

        config_path.write_text(yaml.safe_dump(cfg, sort_keys=False, allow_unicode=True), encoding="utf-8")
        return {"success": True, "connected": True, "base_url": "http://127.0.0.1:20128/v1"}
    except Exception as e:
        logger.exception("Failed to connect Hermes to 9Router: %s", e)
        return {"success": False, "error": str(e)}


def _read_json_body(handler) -> dict:
    try:
        length = int(handler.headers.get("Content-Length", 0))
        if length > 0:
            raw = handler.rfile.read(length)
            return json.loads(raw.decode("utf-8"))
    except Exception:
        pass
    return {}


# ── Route Dispatchers ─────────────────────────────────────────────────────────

def handle_9router_get(handler, parsed) -> bool:
    path = parsed.path
    if path == "/api/9router/status":
        running = is_9router_running()
        active_models = 0
        proxy_pools_count = 0
        connections_count = 0
        version = "unknown"
        if running:
            st_p, data_p = _ninerouter_request("GET", "/api/providers")
            if st_p == 200:
                conns = data_p.get("connections", [])
                connections_count = len(conns)
            st_m, data_m = _ninerouter_request("GET", "/v1/models")
            if st_m == 200:
                active_models = len(data_m.get("data", []))
            st_px, data_px = _ninerouter_request("GET", "/api/proxy-pools")
            if st_px == 200:
                pools = data_px.get("proxyPools", [])
                proxy_pools_count = len(pools)
            st_v, data_v = _ninerouter_request("GET", "/api/version")
            if st_v == 200:
                version = data_v.get("version", "running")

        return j(handler, {
            "installed": Path.home().joinpath(".9router").exists() or bool(get_9router_cli_token()),
            "running": running,
            "port": 20128,
            "version": version,
            "activeModels": active_models,
            "proxyPoolsCount": proxy_pools_count,
            "connectionsCount": connections_count,
            "hermesConnected": is_hermes_using_9router(),
            "hermesActiveModel": get_hermes_active_model(),
        })

    if path == "/api/9router/providers":
        status, data = _ninerouter_request("GET", "/api/providers")
        return j(handler, data, status=status)

    if path == "/api/9router/proxy-pools":
        status, data = _ninerouter_request("GET", "/api/proxy-pools")
        return j(handler, data, status=status)

    if path == "/api/9router/models":
        status, data = _ninerouter_request("GET", "/v1/models")
        j(handler, data, status=status)
        return True

    if path == "/api/9router/usage":
        status, data = _ninerouter_request("GET", "/api/usage/stats")
        j(handler, data, status=status)
        return True

    if path == "/api/9router/cli-tools":
        status, data = _ninerouter_request("GET", "/api/cli-tools/all-statuses")
        j(handler, data, status=status)
        return True

    return False


def handle_9router_post(handler, parsed) -> bool:
    path = parsed.path
    body = _read_json_body(handler)

    if path == "/api/9router/connect-hermes":
        model = body.get("model", "ag/gemini-3.8-flash-medium")
        res = connect_hermes_to_9router(model)
        return j(handler, res, status=200 if res.get("success") else 500)

    if path == "/api/9router/oauth/authorize":
        provider = body.get("provider", "antigravity")
        redirect_uri = "http://localhost:1455/auth/callback" if provider == "codex" else "http://localhost:20128/callback"
        query = urllib.parse.urlencode({"redirect_uri": redirect_uri})
        status, data = _ninerouter_request("GET", f"/api/oauth/{provider}/authorize?{query}")
        return j(handler, data, status=status)

    if path == "/api/9router/oauth/exchange":
        provider = body.get("provider", "antigravity")
        payload = body.get("data", {})
        status, data = _ninerouter_request("POST", f"/api/oauth/{provider}/exchange", body=payload)
        return j(handler, data, status=status)

    if path == "/api/9router/providers/test":
        cid = body.get("id")
        if not cid:
            return j(handler, {"error": "Missing id"}, status=400)
        status, data = _ninerouter_request("POST", f"/api/providers/{cid}/test", body={})
        return j(handler, data, status=status)

    if path == "/api/9router/providers/toggle":
        cid = body.get("id")
        is_active = body.get("isActive", True)
        if not cid:
            return j(handler, {"error": "Missing id"}, status=400)
        status, data = _ninerouter_request("PUT", f"/api/providers/{cid}", body={"isActive": is_active})
        return j(handler, data, status=status)

    if path == "/api/9router/proxy-pools":
        status, data = _ninerouter_request("POST", "/api/proxy-pools", body=body)
        return j(handler, data, status=status)

    if path == "/api/9router/proxy-pools/test":
        pool_id = body.get("id")
        if not pool_id:
            return j(handler, {"error": "Missing id"}, status=400)
        status, data = _ninerouter_request("POST", f"/api/proxy-pools/{pool_id}/test", body={})
        return j(handler, data, status=status)

    if path == "/api/9router/kickstart":
        res = kickstart_9router_service()
        j(handler, res, status=200 if res.get("success") else 500)
        return True

    if path == "/api/9router/switch-model":
        model = body.get("model", "")
        if not model:
            j(handler, {"error": "Missing model parameter"}, status=400)
            return True
        res = set_hermes_active_model(model)
        j(handler, res, status=200 if res.get("success") else 500)
        return True

    if path == "/api/9router/cli-tools/toggle":
        tool = body.get("tool", "")
        action = body.get("action", "apply")
        if tool == "claude":
            if action == "apply":
                status, data = _ninerouter_request("POST", "/api/cli-tools/claude-settings", body={
                    "env": {
                        "ANTHROPIC_BASE_URL": "http://localhost:20128/v1",
                        "ANTHROPIC_DEFAULT_SONNET_MODEL": "ag/claude-sonnet-4-6",
                        "ANTHROPIC_DEFAULT_OPUS_MODEL": "ag/claude-opus-4-6-thinking",
                    }
                })
            else:
                status, data = _ninerouter_request("DELETE", "/api/cli-tools/claude-settings")
            j(handler, data, status=status)
            return True

        if tool == "opencode":
            if action == "apply":
                status, data = _ninerouter_request("POST", "/api/cli-tools/opencode-settings", body={})
            else:
                status, data = _ninerouter_request("DELETE", "/api/cli-tools/opencode-settings")
            j(handler, data, status=status)
            return True

        if tool == "cline":
            if action == "apply":
                status, data = _ninerouter_request("POST", "/api/cli-tools/cline-settings", body={
                    "openAiBaseUrl": "http://localhost:20128/v1",
                    "actModeApiProvider": "openai",
                })
            else:
                status, data = _ninerouter_request("DELETE", "/api/cli-tools/cline-settings")
            j(handler, data, status=status)
            return True

        j(handler, {"error": "Unsupported tool"}, status=400)
        return True

    return False


def handle_9router_put(handler, parsed) -> bool:
    path = parsed.path
    body = _read_json_body(handler)

    if path == "/api/9router/proxy-pools":
        pool_id = body.get("id")
        if not pool_id:
            return j(handler, {"error": "Missing id"}, status=400)
        status, data = _ninerouter_request("PUT", f"/api/proxy-pools/{pool_id}", body=body)
        return j(handler, data, status=status)

    if path == "/api/9router/providers":
        cid = body.get("id")
        if not cid:
            return j(handler, {"error": "Missing id"}, status=400)
        status, data = _ninerouter_request("PUT", f"/api/providers/{cid}", body=body)
        return j(handler, data, status=status)

    return False


def handle_9router_delete(handler, parsed) -> bool:
    path = parsed.path
    query = urllib.parse.parse_qs(parsed.query)
    target_id = (query.get("id", [""])[0] or "").strip()

    if path == "/api/9router/providers":
        if not target_id:
            return j(handler, {"error": "Missing id parameter"}, status=400)
        status, data = _ninerouter_request("DELETE", f"/api/providers/{target_id}")
        return j(handler, data, status=status)

    if path == "/api/9router/proxy-pools":
        if not target_id:
            return j(handler, {"error": "Missing id parameter"}, status=400)
        status, data = _ninerouter_request("DELETE", f"/api/proxy-pools/{target_id}")
        return j(handler, data, status=status)

    return False
