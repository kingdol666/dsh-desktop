"""Browser-assisted PDF retrieval — the last rung of the download ladder.

`litsearch.download_doi` walks the open-access chain and stays inside an HTTP
client. Some legitimate copies never appear on that chain: a subscribed PDF
that the publisher only serves to a JavaScript-capable browser, an older issue
whose `citation_pdf_url` is emitted client-side, a repository behind a
proof-of-work gate. Those need a real rendering engine, not a smarter request.

This module drives a real Chromium over the DevTools protocol
(`science/browser/pm_browser_fetch.mjs`) and saves whatever it retrieves. It is
deliberately *not* an anti-bot bypass: the browser is a normal browser on the
institution's own network, challenges that a browser solves on its own are
allowed to solve themselves, and anything that asks for a human — a CAPTCHA, a
site's own low-confidence verdict — comes back as MANUAL_REQUIRED with the DOI
link so the user can open it once themselves.
"""

import json
import os
import shutil
import subprocess

from pm_science.litsearch import (
    manifest_entry,
    normalize_doi,
    publisher_template_urls,
    require_contained_dir,
)

#: Directory holding the Node driver, resolved from this file:
#: science/src/pm_science/litbrowser.py -> science/browser/.
BROWSER_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "browser",
)
FETCH_SCRIPT = os.path.join(BROWSER_DIR, "pm_browser_fetch.mjs")

#: Wall-clock ceiling for one browser round trip (browser start + challenge + fetch).
DEFAULT_TIMEOUT_MS = 180000

#: Statuses this module can return.
STATUS_DOWNLOADED = "DOWNLOADED"
STATUS_MANUAL = "MANUAL_REQUIRED"
STATUS_CHALLENGE = "CLOUDFLARE_CHALLENGE"
STATUS_UNAVAILABLE = "BROWSER_UNAVAILABLE"


def _node_binary():
    """Locate a Node.js interpreter able to run the driver."""
    candidates = [
        os.environ.get("PM_NODE"),
        shutil.which("node"),
        shutil.which("node.exe"),
        r"C:\nvm4w\nodejs\node.exe",
        r"C:\Program Files\nodejs\node.exe",
        "/usr/local/bin/node",
        "/usr/bin/node",
    ]
    for candidate in candidates:
        if candidate and os.path.exists(candidate):
            return candidate
    return None


def browser_available():
    """Report whether the browser rung can run at all (for diagnostics/hints)."""
    node = _node_binary()
    return {
        "node": node,
        "script": FETCH_SCRIPT,
        "scriptPresent": os.path.exists(FETCH_SCRIPT),
        "ready": bool(node) and os.path.exists(FETCH_SCRIPT),
        "chromePathEnv": os.environ.get("PM_CHROME_PATH"),
    }


def _contained_path(target_dir, filename):
    """Resolve `filename` inside `target_dir`, rejecting traversal."""
    base_real = os.path.realpath(target_dir)
    resolved = os.path.realpath(os.path.join(base_real, filename))
    if os.path.commonpath([base_real, resolved]) != base_real:
        raise ValueError("PATH_ESCAPE: %s is outside %s" % (filename, target_dir))
    return resolved


def _safe_filename(value, limit=120):
    """Reduce a caller-supplied name to [a-z0-9_.-] and force a .pdf suffix."""
    stem = str(value or "").strip().replace("\\", "-").replace("/", "-")
    stem = "".join(ch if (ch.isalnum() or ch in "._-") else "-" for ch in stem.lower())
    stem = stem.strip("-.") or "browser-fetch"
    if not stem.lower().endswith(".pdf"):
        stem += ".pdf"
    return stem[:limit]


def download_via_browser(request):
    """Retrieve one PDF through a real Chromium and register it in the manifest.

    Request keys: `doi` or `url` (one required), `targetDir` (required),
    `filename` (optional), `port`, `profileDir`, `chromePath`, `timeoutMs`.

    Returns a result envelope shaped like `litsearch.download_doi`: `ok`,
    `doi`, `status`, `targetDir`, `landingUrl`, `attempts`, `manifestEntry`.
    """
    doi_value = normalize_doi(request.get("doi"))
    url_value = str(request.get("url") or "").strip()
    if not doi_value and not url_value:
        return {"ok": False, "error": "doi or url is required"}

    try:
        target_dir = require_contained_dir(request.get("targetDir"))
    except ValueError as cause:
        return {"ok": False, "error": str(cause)}
    os.makedirs(target_dir, exist_ok=True)

    diagnostics = browser_available()
    if not diagnostics["ready"]:
        return {
            "ok": False,
            "doi": doi_value or None,
            "status": STATUS_UNAVAILABLE,
            "targetDir": target_dir,
            "note": "需要 Node.js 运行浏览器驱动；设置 PM_NODE 指向 node 可执行文件后重试。",
            "diagnostics": diagnostics,
        }

    filename = _safe_filename(request.get("filename") or (
        "%s.pdf" % (doi_value.replace("/", "_") if doi_value else "browser-fetch")
    ))
    try:
        out_path = _contained_path(target_dir, filename)
    except ValueError as cause:
        return {"ok": False, "error": str(cause)}

    payload = {
        "doi": doi_value or None,
        "url": url_value or None,
        "outPath": out_path,
        # 出版社模板（已过 allowlist）先试：老文章常不在页面上暴露 PDF 链接。
        "candidates": publisher_template_urls(doi_value) if doi_value else [],
        "port": int(request.get("port") or 9333),
        "timeoutMs": int(request.get("timeoutMs") or DEFAULT_TIMEOUT_MS),
    }
    for key in ("profileDir", "chromePath", "waitMs"):
        if request.get(key) is not None:
            payload[key] = request[key]

    timeout_s = float(payload["timeoutMs"]) / 1000.0 + 60.0
    try:
        completed = subprocess.run(
            [diagnostics["node"], FETCH_SCRIPT, json.dumps(payload)],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=timeout_s,
            cwd=BROWSER_DIR,
        )
    except subprocess.TimeoutExpired:
        return {
            "ok": False,
            "doi": doi_value or None,
            "status": STATUS_MANUAL,
            "targetDir": target_dir,
            "note": "浏览器抓取超时（%d s）；可改用人工打开 DOI。" % int(timeout_s),
        }

    line = (completed.stdout or "").strip().splitlines()
    result = None
    for candidate in reversed(line):
        try:
            parsed = json.loads(candidate)
        except json.JSONDecodeError:
            continue
        if isinstance(parsed, dict) and "status" in parsed:
            result = parsed
            break
    if result is None:
        return {
            "ok": False,
            "doi": doi_value or None,
            "status": STATUS_UNAVAILABLE,
            "targetDir": target_dir,
            "note": "浏览器驱动没有返回可解析的结果：%s" % ((completed.stderr or "")[-400:] or "no output"),
        }

    status = str(result.get("status") or STATUS_MANUAL)
    landing = result.get("landingUrl") or (
        "https://doi.org/%s" % doi_value if doi_value else url_value
    )
    record = {
        "doi": doi_value,
        "status": status,
        "filename": filename,
        "engine": "chromium-cdp",
    }
    if status == STATUS_DOWNLOADED:
        record["bytes"] = result.get("bytes")
        record["source"] = str(result.get("source") or "")[:300]
    else:
        record["note"] = result.get("note") or result.get("reason") or ""
        if result.get("links"):
            record["links"] = result["links"]
    record, deduped = manifest_entry(target_dir, record)

    envelope = {
        "ok": status == STATUS_DOWNLOADED,
        "doi": doi_value or None,
        "status": status,
        "targetDir": target_dir,
        "landingUrl": landing,
        "attempts": result.get("attempts") or [],
        "manifestDeduped": deduped,
        "manifestEntry": record,
    }
    if status == STATUS_DOWNLOADED:
        envelope["path"] = out_path
        envelope["filename"] = filename
        envelope["bytes"] = result.get("bytes")
        envelope["source"] = result.get("source")
    else:
        envelope["note"] = result.get("note") or result.get("reason")
        envelope["pageUrl"] = result.get("pageUrl")
        envelope["pageTitle"] = result.get("pageTitle")
        envelope["bodyHead"] = result.get("bodyHead")
        envelope["links"] = result.get("links") or []
    return envelope
