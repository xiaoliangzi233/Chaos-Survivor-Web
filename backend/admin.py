from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

from fastapi import Header, HTTPException
from fastapi.responses import HTMLResponse

from .schemas import VALID_CONFIG_KINDS


PROJECT_ROOT = Path(__file__).resolve().parents[1]
CONFIG_ROOT = PROJECT_ROOT / "src" / "config"


def admin_token() -> str:
    return os.environ.get("ADMIN_TOKEN", "local-admin")


def require_admin(x_admin_token: str | None = Header(default=None)) -> None:
    if x_admin_token != admin_token():
        raise HTTPException(status_code=401, detail="admin_token_required")


def validate_config_kind(kind: str) -> str:
    normalized = kind.strip()
    if normalized not in VALID_CONFIG_KINDS:
        raise HTTPException(status_code=404, detail="invalid_config_kind")
    return normalized


def config_path(kind: str) -> Path:
    return CONFIG_ROOT / VALID_CONFIG_KINDS[validate_config_kind(kind)]


def read_config_file(kind: str) -> dict[str, Any]:
    path = config_path(kind)
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="config_file_not_found") from exc
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=500, detail=f"config_file_invalid:{exc}") from exc


def write_config_file(kind: str, data: dict[str, Any]) -> None:
    path = config_path(kind).resolve()
    config_root = CONFIG_ROOT.resolve()
    if config_root not in path.parents:
        raise HTTPException(status_code=400, detail="unsafe_config_path")
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def admin_page() -> HTMLResponse:
    kinds = ", ".join(VALID_CONFIG_KINDS)
    return HTMLResponse(
        f"""<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Survivor Admin</title>
  <style>
    body {{ margin: 0; background: #091018; color: #d9fbff; font: 14px Consolas, monospace; }}
    main {{ max-width: 1100px; margin: 0 auto; padding: 24px; }}
    header, section {{ border: 1px solid #2de2ff55; background: #0d1823; padding: 16px; margin-bottom: 16px; }}
    h1, h2 {{ margin: 0 0 12px; color: #78f7ff; }}
    label {{ display: grid; gap: 6px; margin: 10px 0; }}
    input, select, textarea, button {{ background: #050a10; color: #d9fbff; border: 1px solid #2de2ff66; padding: 8px; font: inherit; }}
    textarea {{ min-height: 420px; resize: vertical; }}
    button {{ cursor: pointer; margin-right: 8px; }}
    button.primary {{ border-color: #ffd166; color: #ffd166; }}
    #status {{ color: #72ffb4; min-height: 1.4em; }}
  </style>
</head>
<body>
<main>
  <header>
    <h1>Survivor Local Admin</h1>
    <p>Available config kinds: {kinds}. Default token is <code>local-admin</code>; override with <code>ADMIN_TOKEN</code>.</p>
  </header>
  <section>
    <label>Admin Token <input id="token" type="password" value="local-admin"></label>
    <label>Config Kind
      <select id="kind">{''.join(f'<option value="{kind}">{kind}</option>' for kind in VALID_CONFIG_KINDS)}</select>
    </label>
    <p>
      <button id="load">Load active</button>
      <button id="save">Save draft</button>
      <button id="publish" class="primary">Publish to src/config</button>
    </p>
    <p id="status"></p>
    <textarea id="editor" spellcheck="false"></textarea>
  </section>
</main>
<script>
const qs = (id) => document.getElementById(id);
async function request(path, options = {{}}) {{
  const response = await fetch(path, {{
    ...options,
    headers: {{ "Content-Type": "application/json", "X-Admin-Token": qs("token").value, ...(options.headers || {{}}) }}
  }});
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(data?.detail || response.statusText);
  return data;
}}
qs("load").onclick = async () => {{
  try {{
    const data = await request(`/api/config/${{qs("kind").value}}`);
    qs("editor").value = JSON.stringify(data.data, null, 2);
    qs("status").textContent = "Loaded active config.";
  }} catch (error) {{ qs("status").textContent = error.message; }}
}};
qs("save").onclick = async () => {{
  try {{
    const data = JSON.parse(qs("editor").value);
    await request(`/api/admin/config/${{qs("kind").value}}`, {{ method: "PUT", body: JSON.stringify({{ data }}) }});
    qs("status").textContent = "Draft saved.";
  }} catch (error) {{ qs("status").textContent = error.message; }}
}};
qs("publish").onclick = async () => {{
  try {{
    const data = JSON.parse(qs("editor").value);
    await request(`/api/admin/config/${{qs("kind").value}}`, {{ method: "PUT", body: JSON.stringify({{ data }}) }});
    await request(`/api/admin/config/${{qs("kind").value}}/publish`, {{ method: "POST" }});
    qs("status").textContent = "Published.";
  }} catch (error) {{ qs("status").textContent = error.message; }}
}};
</script>
</body>
</html>"""
    )
