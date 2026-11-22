"""Human-readable analysis reports: Markdown + a styled self-contained HTML page.

The report payload is a plain JSON-compatible dict:

    {
        "title": str, "subtitle": str, "date": "YYYY-MM-DD",
        "kpis": [{"label", "value", "unit", "note"}, ...],
        "sections": [{"heading", "narrative", "table": {headers, rows},
                      "figure": {title, xLabel, yLabel, height,
                                 series: [{name, points, dash}, ...]}}, ...],
        "conclusions": [str, ...], "nextSteps": [str, ...],
        "artifacts": [{"name", "path"}, ...],
    }

``render_report`` writes ``<name>.md`` and ``<name>.html`` into the requested
output directory.  Both output paths are resolved through a containment guard
(``os.path.commonpath`` against the real base directory) so that a crafted
name can never escape the target directory; the report name itself is
restricted to ASCII letters, digits, ``-`` and ``_`` (everything else is
replaced with ``_``).  Only the standard library is used: the HTML page is
fully self-contained (inline CSS + inline SVG charts, no external assets).
"""

import html
import json
import os
from datetime import date
from pathlib import Path
from typing import Any

__all__ = ["render_report", "validate_payload"]

CHART_COLORS = [
    "#2563eb",
    "#dc2626",
    "#059669",
    "#d97706",
    "#7c3aed",
    "#0891b2",
    "#be185d",
]

_MAX_POINTS_PER_SERIES = 900

_NAME_CHARS = set("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_")


def validate_payload(payload: Any) -> list[str]:
    """Return human-readable problems with *payload*; empty list when usable."""
    if not isinstance(payload, dict):
        return ["payload must be an object"]
    problems: list[str] = []
    title = payload.get("title")
    if not isinstance(title, str) or not title.strip():
        problems.append("title is required")
    sections = payload.get("sections")
    if not isinstance(sections, list) or not sections:
        problems.append("sections must be a non-empty list")
        return problems
    for index, section in enumerate(sections):
        if not isinstance(section, dict):
            problems.append("sections[%d] must be an object" % index)
            continue
        heading = section.get("heading")
        if not isinstance(heading, str) or not heading.strip():
            problems.append("sections[%d].heading is required" % index)
        figure = section.get("figure")
        if not figure:
            continue
        if not isinstance(figure, dict):
            problems.append("sections[%d].figure must be an object" % index)
            continue
        series = figure.get("series")
        if not isinstance(series, list):
            problems.append("sections[%d].figure.series must be a list" % index)
            continue
        for s_index, spec in enumerate(series):
            if not isinstance(spec, dict):
                problems.append(
                    "sections[%d].figure.series[%d] must be an object" % (index, s_index)
                )
                continue
            points = spec.get("points")
            if not isinstance(points, list) or len(points) < 2:
                problems.append(
                    "sections[%d].figure.series[%d].points must be a list with at least 2 points"
                    % (index, s_index)
                )
    return problems


def _downsample(points: list) -> list:
    """Thin very long point lists so charts stay readable and compact."""
    if len(points) <= _MAX_POINTS_PER_SERIES:
        return points
    step = len(points) // _MAX_POINTS_PER_SERIES + 1
    return points[::step]


def _svg_chart(figure: dict) -> str:
    """Render ``figure`` as an inline SVG line chart (no external assets)."""
    cleaned: list[dict] = []
    for index, spec in enumerate(figure["series"]):
        if not isinstance(spec, dict):
            continue
        points: list[list[float]] = []
        for pair in spec.get("points") or []:
            if isinstance(pair, (list, tuple)) and len(pair) >= 2:
                try:
                    points.append([float(pair[0]), float(pair[1])])
                except (TypeError, ValueError):
                    continue
        points = _downsample(points)
        if len(points) < 2:
            continue
        cleaned.append(
            {
                "name": str(spec.get("name", "series %d" % (index + 1))),
                "points": points,
                "dash": bool(spec.get("dash")),
            }
        )
    if not cleaned:
        return ""

    flat = [pt for entry in cleaned for pt in entry["points"]]
    xs = [pt[0] for pt in flat]
    ys = [pt[1] for pt in flat]
    x_lo, x_hi = min(xs), max(xs)
    y_lo, y_hi = min(ys), max(ys)
    if x_hi <= x_lo:
        x_hi = x_lo + 1.0
    pad = (y_hi - y_lo) * 0.08 if y_hi > y_lo else max(abs(y_hi) * 0.08, 1.0)
    y_floor = y_lo - pad
    y_ceil = y_hi + pad

    width = 860
    height = int(figure.get("height", 320))
    left, top, right, bottom = 64, 14, 14, 42
    plot_w = width - left - right
    plot_h = height - top - bottom

    def px(v: float) -> float:
        return left + (v - x_lo) / (x_hi - x_lo) * plot_w

    def py(v: float) -> float:
        return top + (y_ceil - v) / (y_ceil - y_floor) * plot_h

    parts: list[str] = [
        f'<svg viewBox="0 0 {width} {height}" role="img" class="chart">',
        '<rect width="100%" height="100%" rx="10" fill="#ffffff" stroke="#e2e8f0"/>',
    ]

    for fraction in (0.0, 0.25, 0.5, 0.75, 1.0):
        gy = top + fraction * plot_h
        parts.append(
            '<line x1="%d" y1="%.1f" x2="%d" y2="%.1f" stroke="#eef2f7"/>'
            % (left, gy, left + plot_w, gy)
        )
        value = y_ceil - fraction * (y_ceil - y_floor)
        parts.append(
            '<text class="tick" text-anchor="end" x="%d" y="%.1f">%s</text>'
            % (left - 6, gy + 4, format(value, ".4g"))
        )

    for fraction in (0.0, 0.5, 1.0):
        value = x_lo + fraction * (x_hi - x_lo)
        parts.append(
            '<text class="tick" text-anchor="middle" x="%.1f" y="%d">%s</text>'
            % (left + fraction * plot_w, height - bottom + 18, format(value, ".4g"))
        )

    parts.append(
        '<line x1="%d" y1="%d" x2="%d" y2="%d" stroke="#94a3b8"/>'
        % (left, top + plot_h, left + plot_w, top + plot_h)
    )
    parts.append(
        '<line x1="%d" y1="%d" x2="%d" y2="%d" stroke="#94a3b8"/>'
        % (left, top, left, top + plot_h)
    )

    for i, entry in enumerate(cleaned):
        color = CHART_COLORS[i % len(CHART_COLORS)]
        dash = ' stroke-dasharray="6 4"' if entry["dash"] else ""
        segments: list[str] = []
        for j, (x, y) in enumerate(entry["points"]):
            segments.append(("M" if j == 0 else "L") + f" {px(x):.2f} {py(y):.2f}")
        path = "".join(segments)
        parts.append(
            f'<path d="{path}" fill="none" stroke="{color}" stroke-width="1.8"{dash}/>'
        )

    x_label = figure.get("xLabel")
    if x_label:
        parts.append(
            '<text x="%.1f" y="%d" text-anchor="middle" class="label">%s</text>'
            % (left + plot_w / 2, height - 6, html.escape(str(x_label)))
        )
    y_label = figure.get("yLabel")
    if y_label:
        pivot = top + plot_h / 2
        parts.append(
            '<text x="16" y="%.1f" text-anchor="middle" transform="rotate(-90 16 %.0f)" class="label">%s</text>'
            % (pivot, pivot, html.escape(str(y_label)))
        )

    for i, entry in enumerate(cleaned):
        ly = top + 16 + i * 18
        color = CHART_COLORS[i % len(CHART_COLORS)]
        parts.append(
            '<line x1="%d" y1="%d" x2="%d" y2="%d" stroke="%s" stroke-width="2.4"/>'
            % (left + 10, ly, left + 36, ly, color)
        )
        parts.append(
            '<text x="%d" y="%d" class="legend">%s</text>'
            % (left + 42, ly + 4, html.escape(entry["name"]))
        )

    if figure.get("title"):
        parts.append(
            '<text x="%d" y="%d" text-anchor="end" class="legend">%s</text>'
            % (width - right - 6, top + 16, html.escape(str(figure["title"])))
        )

    parts.append("</svg>")
    return "\n".join(parts)


def _md_table(headers: list, rows: list) -> str:
    """Format a Markdown pipe table."""
    out = ["| " + " | ".join(str(cell) for cell in headers) + " |"]
    out.append("| " + " | ".join("---" for _ in headers) + " |")
    for row in rows:
        cells = ["" if cell is None else str(cell) for cell in row]
        out.append("| " + " | ".join(cells) + " |")
    return "\n".join(out)


def render_markdown(payload: dict) -> str:
    """Render the payload as a Markdown document."""
    out: list[str] = [f"# {payload['title']}", ""]
    subtitle = payload.get("subtitle")
    if subtitle:
        out.append(str(subtitle))
        out.append("")
    out.append(f"- 分析日期：{payload.get('date') or date.today().isoformat()}")
    out.append("")

    kpis = payload.get("kpis") or []
    if kpis:
        out.append("## 关键指标")
        out.append("")
        for kpi in kpis:
            unit = f" {kpi['unit']}" if kpi.get("unit") else ""
            note = f"（{kpi['note']}）" if kpi.get("note") else ""
            out.append(f"- **{kpi['label']}**：{kpi.get('value','')}{unit}{note}")
        out.append("")

    for section in payload.get("sections", []):
        out.append(f"## {section['heading']}")
        out.append("")
        narrative = section.get("narrative")
        if narrative:
            out.append(str(narrative))
            out.append("")
        table = section.get("table")
        if table:
            out.append(_md_table(table["headers"], table["rows"]))
            out.append("")
        figure = section.get("figure")
        if figure:
            names = "、".join(
                str(spec.get("name", f"series {i + 1}"))
                for i, spec in enumerate(figure.get("series") or [])
            )
            out.append(
                f"*图：{figure.get('title') or names}"
                f"（X：{figure.get('xLabel','')}；Y：{figure.get('yLabel','')}）*"
            )
            out.append("")

    conclusions = payload.get("conclusions") or []
    if conclusions:
        out.append("## 结论")
        out.append("")
        for i, line in enumerate(conclusions):
            out.append(f"{i + 1}. {line}")
        out.append("")

    next_steps = payload.get("nextSteps") or []
    out.append("## 下一步")
    out.append("")
    for line in next_steps:
        out.append(f"- {line}")
    out.append("")

    artifacts = payload.get("artifacts") or []
    out.append("## 产物文件")
    out.append("")
    for artifact in artifacts:
        out.append(f"- `{artifact.get('path','')}`（{artifact.get('name','')}）")
    out.append("")

    return "\n".join(out)


_CSS = (
    ":root{--bg:#f5f7fb;--card:#ffffff;--ink:#0f172a;--muted:#64748b;--line:#e2e8f0;--accent:#2563eb}",
    "*{box-sizing:border-box}",
    "body{margin:0;background:var(--bg);color:var(--ink);line-height:1.6;"
    "font-family:'Segoe UI','Microsoft YaHei','PingFang SC',system-ui,sans-serif}",
    ".wrap{max-width:980px;margin:0 auto;padding:28px 18px 40px}",
    ".hero{background:linear-gradient(135deg,#1e3a8a,#2563eb 55%,#0891b2);color:#ffffff;"
    "border-radius:16px;padding:30px 34px;margin-bottom:22px}",
    ".hero h1{margin:0 0 8px;font-size:26px;letter-spacing:.5px}",
    ".hero .sub{opacity:.92;font-size:15px;margin-bottom:10px}",
    ".hero .meta{opacity:.8;font-size:13px}",
    ".kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px;margin-bottom:20px}",
    ".kpi{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px 18px}",
    ".kpi .label{font-size:12px;color:var(--muted);margin-bottom:6px}",
    ".kpi .value{font-size:24px;font-weight:700;color:var(--accent)}",
    ".kpi .value small{font-size:13px;font-weight:500;color:var(--muted);margin-left:3px}",
    ".kpi .note{font-size:12px;color:var(--muted);margin-top:6px}",
    "section.card{background:var(--card);border:1px solid var(--line);border-radius:14px;"
    "padding:22px 26px;margin-bottom:20px}",
    "section.card h2{margin:0 0 14px;font-size:19px;color:#1e3a8a;"
    "border-left:4px solid var(--accent);padding-left:10px}",
    ".narrative{white-space:pre-wrap;font-size:14.5px;margin-bottom:14px}",
    "table{border-collapse:collapse;width:100%;font-size:14px;margin-bottom:14px}",
    "th,td{border:1px solid var(--line);padding:7px 10px;text-align:left}",
    "th{background:#f1f5f9}",
    "tr:nth-child(even) td{background:#f8fafc}",
    "svg.chart{width:100%;height:auto;display:block;margin-bottom:6px}",
    ".tick{font-size:11px;fill:#94a3b8}",
    ".label{font-size:12px;fill:#64748b}",
    ".legend{font-size:12px;fill:#334155}",
    "ol.conclusions{padding-left:20px;margin:0}",
    "ol.conclusions li{margin:6px 0}",
    "ul.clean{padding-left:20px;margin:0}",
    "ul.clean li{margin:6px 0}",
    "code{background:#f1f5f9;border-radius:4px;padding:2px 6px;font-size:13px}",
    "footer{text-align:center;color:var(--muted);font-size:12px;margin-top:26px}",
    "@media print{body{background:#ffffff}.wrap{max-width:none;padding:0}}",
)


def render_html(payload: dict) -> str:
    """Render the payload as a styled, self-contained HTML page."""
    esc = html.escape
    kpis = payload.get("kpis") or []
    parts: list[str] = [
        "<!DOCTYPE html>",
        '<html lang="zh-CN"><head><meta charset="utf-8">',
        '<meta name="viewport" content="width=device-width, initial-scale=1">',
        f"<title>{esc(str(payload['title']))}</title>",
        f"<style>{_CSS}</style></head><body><div class='wrap'>",
        "<header class='hero'>",
        f"<h1>{esc(str(payload['title']))}</h1>",
        f"<div class='sub'>{esc(str(payload.get('subtitle','')))}</div>",
        f"<div class='meta'>分析日期：{esc(str(payload.get('date') or date.today().isoformat()))}"
        " · PolyMechanism Studio 高分子数据解析</div>",
        "</header>",
    ]

    if kpis:
        parts.append("<div class='kpis'>")
        for kpi in kpis:
            parts.append("<div class='kpi'>")
            parts.append(f"<div class='label'>{esc(str(kpi['label']))}</div>")
            unit = f"<small>{esc(str(kpi['unit']))}</small>" if kpi.get("unit") else ""
            parts.append(f"<div class='value'>{esc(str(kpi.get('value','')))}{unit}</div>")
            if kpi.get("note"):
                parts.append(f"<div class='note'>{esc(str(kpi['note']))}</div>")
            parts.append("</div>")
        parts.append("</div>")

    for section in payload.get("sections", []):
        parts.append("<section class='card'>")
        parts.append(f"<h2>{esc(str(section['heading']))}</h2>")
        narrative = section.get("narrative")
        if narrative:
            parts.append(f"<div class='narrative'>{esc(str(narrative))}</div>")
        table = section.get("table")
        if table:
            parts.append("<table><thead><tr>")
            for header in table["headers"]:
                parts.append(f"<th>{esc(str(header))}</th>")
            parts.append("</tr></thead><tbody>")
            for row in table["rows"]:
                parts.append("<tr>")
                for cell in row:
                    parts.append(f"<td>{esc('' if cell is None else str(cell))}</td>")
                parts.append("</tr>")
            parts.append("</tbody></table>")
        figure = section.get("figure")
        if figure:
            parts.append(_svg_chart(figure))
        parts.append("</section>")

    conclusions = payload.get("conclusions") or []
    if conclusions:
        parts.append("<section class='card'><h2>结论</h2><ol class='conclusions'>")
        for line in conclusions:
            parts.append(f"<li>{esc(str(line))}</li>")
        parts.append("</ol></section>")

    next_steps = payload.get("nextSteps") or []
    if next_steps:
        parts.append("<section class='card'><h2>下一步</h2><ul class='clean'>")
        for line in next_steps:
            parts.append(f"<li>{esc(str(line))}</li>")
        parts.append("</ul></section>")

    artifacts = payload.get("artifacts") or []
    if artifacts:
        parts.append("<section class='card'><h2>产物文件</h2><ul class='clean'>")
        for artifact in artifacts:
            path_text = esc(str(artifact.get("path", "")))
            name_text = esc(str(artifact.get("name", "")))
            parts.append(f"<li><code>{path_text}</code>（{name_text}）</li>")
        parts.append("</ul></section>")

    parts.append(
        f"<footer>PolyMechanism Studio · 自动生成于 "
        f"{esc(str(payload.get('date') or date.today().isoformat()))}"
        " · 本页为自包含 HTML（无外部依赖）</footer>"
    )
    parts.append("</div></body></html>")
    return "\n".join(parts)


def _guarded_path(target_dir: str, filename: str) -> Path:
    """Resolve *filename* under *target_dir*, refusing any path escape."""
    base_real = Path(os.path.realpath(target_dir))
    resolved = Path(os.path.realpath(str(base_real / filename)))
    if os.path.commonpath([str(base_real), str(resolved)]) != str(base_real):
        raise ValueError("PATH_ESCAPE: %s is outside %s" % (filename, target_dir))
    return resolved


def render_report(payload: dict, output_dir: str, name: str) -> dict:
    """Validate *payload* and write Markdown + HTML reports into *output_dir*.

    Returns a dict with ``status``, both output paths and their byte sizes.
    Raises ``ValueError`` when the payload is invalid or the resolved output
    path would escape *output_dir*.
    """
    problems = validate_payload(payload)
    if problems:
        raise ValueError("invalid report payload: " + "; ".join(problems))
    safe_name = (
        "".join(ch if ch in _NAME_CHARS else "_" for ch in str(name).strip()) or "report"
    )
    os.makedirs(Path(os.path.realpath(output_dir)), exist_ok=True)
    md_path = _guarded_path(output_dir, "%s.md" % safe_name)
    html_path = _guarded_path(output_dir, "%s.html" % safe_name)
    md_path.write_text(render_markdown(payload), encoding="utf-8")
    html_path.write_text(render_html(payload), encoding="utf-8")
    return {
        "status": "OK",
        "markdownPath": str(md_path),
        "htmlPath": str(html_path),
        "markdownBytes": md_path.stat().st_size,
        "htmlBytes": html_path.stat().st_size,
    }


def main() -> None:
    """CLI entry: ``python report.py <payload.json> <output_dir> <name>``."""
    import sys

    if len(sys.argv) != 4:
        print(
            json.dumps(
                {"ok": False, "error": "usage: report.py <payload.json> <output_dir> <name>"},
                ensure_ascii=False,
            )
        )
        raise SystemExit(2)
    payload = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    try:
        result = render_report(payload, sys.argv[2], sys.argv[3])
    except (ValueError, OSError) as cause:
        print(json.dumps({"ok": False, "error": str(cause)}, ensure_ascii=False))
        raise SystemExit(1)
    print(json.dumps({"ok": True, **result}, ensure_ascii=False))


if __name__ == "__main__":
    main()
