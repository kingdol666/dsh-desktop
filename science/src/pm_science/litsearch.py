"""Literature search, download and polymer screening over public scholarly APIs.

The download chain never bypasses paywalls: institutional IP access only;
anti-bot walls degrade to CAMPUS_REQUIRED instead of being circumvented.

Security model (docs/polymechanism/11-文献检索与高分子筛选设计.md §4.4):
- EGRESS HOST ALLOWLIST: outbound requests may only target a fixed set of
  public scholarly API and publisher hosts;
- scheme allowlist (http/https) + every resolved address must be public
  unicast before any request is issued;
- every redirect hop re-runs the full guard;
- every file write goes through :func:`safe_join` directory containment;
- caps: 50 MiB per response, 8 redirect hops, 45 s timeouts.
"""

import ipaddress
import json
import os
import re
import socket
import time
import urllib.error
import urllib.parse
import urllib.request

UA = "polymechanism-lit/1.0 (institutional-access)"
MAILTO = "research@example.edu"
MAX_BYTES = 50 * 1024 * 1024
TIMEOUT_SECONDS = 45
HOP_LIMIT = 8

EGRESS_HOST_ALLOWLIST = frozenset({
    "api.openalex.org",
    "api.crossref.org",
    "api.unpaywall.org",
    "api.semanticscholar.org",
    "arxiv.org",
    "export.arxiv.org",
    "doi.org",
    "dx.doi.org",
    "link.springer.com",
    "onlinelibrary.wiley.com",
    "pubs.acs.org",
    "pubs.rsc.org",
    "www.tandfonline.com",
    "iopscience.iop.org",
    "www.mdpi.com",
    "www.nature.com",
    "www.jstage.jst.go.jp",
    "www.sciencedirect.com",
    "linkinghub.elsevier.com",
    "www.science.org",
    "www.pnas.org",
    "pubs.aip.org",
    "aip.scitation.org",
    "ieeexplore.ieee.org",
})

ANTI_BOT_MARKS = (
    "just a moment", "cf-browser-verification", "__cf_chl", "access denied", "akamai",
)

class UrlBlocked(ValueError):
    """Raised when a URL fails the egress guard."""


def _validated_parts(url):
    """Validate scheme + host allowlist + public-unicast DNS for one URL.

    Returns the rebuilt URL string; raises UrlBlocked on any violation.
    Both openers run this immediately before issuing a request so every
    caller and every redirect hop gets the full check.
    """
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise UrlBlocked("BLOCKED_SCHEME")
    host = parsed.hostname
    if not host:
        raise UrlBlocked("BLOCKED_NO_HOST")
    if host not in EGRESS_HOST_ALLOWLIST:
        raise UrlBlocked("BLOCKED_HOST_NOT_ALLOWLISTED: %s" % host)
    try:
        addr_infos = socket.getaddrinfo(host, None)
    except socket.gaierror as cause:
        raise UrlBlocked("BLOCKED_DNS: %s" % cause)
    for info in addr_infos:
        address = ipaddress.ip_address(info[4][0])
        if not address.is_global:
            raise UrlBlocked("BLOCKED_PRIVATE_HOST: %s -> %s" % (host, address))
    return urllib.parse.urlunparse(parsed)


def open_public_url(url, headers=None):
    """Open one outbound GET after full validation via :func:`_validated_parts`."""
    checked = _validated_parts(url)
    request = urllib.request.Request(checked, headers={"User-Agent": UA, **(headers or {})})
    return urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS)


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def open_public_url_stay(url, headers=None):
    """Guarded GET without redirect follow (raw response for manual hops)."""
    checked = _validated_parts(url)
    request = urllib.request.Request(checked, headers={"User-Agent": UA, **(headers or {})})
    opener = urllib.request.build_opener(_NoRedirect)
    try:
        return opener.open(request, timeout=TIMEOUT_SECONDS)
    except urllib.error.HTTPError as error:
        return error


def fetch_json(url):
    with open_public_url(url) as response:
        return json.loads(response.read(MAX_BYTES).decode("utf-8", "replace"))


def safe_join(base_dir, name):
    """Join and require the result stays inside base_dir (containment check)."""
    base_real = os.path.realpath(base_dir)
    joined_real = os.path.realpath(os.path.join(base_real, name))
    if os.path.commonpath([base_real, joined_real]) != base_real:
        raise ValueError("PATH_ESCAPE: %s is outside %s" % (name, base_dir))
    return joined_real


def is_pdf_payload(payload):
    return payload[:4] == b"%PDF"


def download_bytes(url, cookie_jar=None):
    """Manually follow redirects; full guard re-runs on every hop. Caps size."""
    jar = list(cookie_jar or [])
    current = url
    for _ in range(HOP_LIMIT):
        response = open_public_url_stay(current)
        if 300 <= response.status < 400:
            location = response.headers.get("Location")
            if not location:
                break
            current = urllib.parse.urljoin(current, location)
            for cookie in response.headers.get_all("Set-Cookie") or []:
                name_value = cookie.split(";")[0]
                name = name_value.split("=")[0]
                jar = [keep for keep in jar if keep.split("=")[0] != name]
                jar.append(name_value)
            continue
        payload = response.read(MAX_BYTES + 1)
        if len(payload) > MAX_BYTES:
            raise UrlBlocked("BLOCKED_TOO_LARGE")
        return payload, (response.headers.get("Content-Type") or "").lower(), jar
    raise UrlBlocked("BLOCKED_TOO_MANY_REDIRECTS")


DOI_RESOLVER = "https://doi.org/"
UNPAYWALL_API = "https://api.unpaywall.org/v2/"
OPENALEX_API = "https://api.openalex.org/works"
CROSSREF_API = "https://api.crossref.org/works"
ARXIV_PDF = "https://arxiv.org/pdf/"


def unpaywall_pdf_url(doi):
    email = os.environ.get("UNPAYWALL_EMAIL") or MAILTO
    params = urllib.parse.urlencode({"email": email})
    url = UNPAYWALL_API + urllib.parse.quote(doi, safe="") + "?" + params
    try:
        payload = fetch_json(url)
    except (UrlBlocked, urllib.error.URLError, json.JSONDecodeError):
        return None
    best = payload.get("best_oa_location") or {}
    return best.get("url_for_pdf") or best.get("url") or None


def crossref_pdf_urls(doi):
    url = CROSSREF_API + "/" + urllib.parse.quote(doi, safe="")
    try:
        payload = fetch_json(url)
    except (UrlBlocked, urllib.error.URLError, json.JSONDecodeError):
        return []
    links = []
    for link in (payload.get("message", {}).get("link") or []):
        content_type = link.get("content-type") or ""
        candidate = link.get("URL") or ""
        if "pdf" in content_type or re.search(r"\.pdf($|\?)", candidate, re.IGNORECASE):
            links.append(candidate)
    return links


def arxiv_id_of(value):
    match = (re.search(r"10\.48550/arxiv\.(.+)", value, re.IGNORECASE)
             or re.search(r"^arxiv[:/](.+)", value, re.IGNORECASE)
             or re.match(r"^(\d{4}\.\d{4,5})(v\d+)?$", value))
    return match.group(1) if match else None


def openalex_work_to_candidate(raw):
    oa = raw.get("open_access") or {}
    best = oa.get("best_oa_location") or {}
    primary = raw.get("primary_location") or {}
    source = primary.get("source") or {}
    doi_value = raw.get("doi")
    if isinstance(doi_value, str):
        doi_value = doi_value.replace("https://doi.org/", "").lower()
    return {
        "doi": doi_value or None,
        "title": raw.get("title"),
        "venue": source.get("display_name"),
        "year": raw.get("publication_year"),
        "authors": [a.get("author", {}).get("display_name") for a in (raw.get("authorships") or [])[:4]],
        "citedByCount": raw.get("cited_by_count") or 0,
        "oaStatus": oa.get("oa_status") or "unknown",
        "oaUrl": best.get("pdf_url") or best.get("landing_page_url"),
        "topics": [(t.get("display_name") or "") for t in (raw.get("topics") or [])[:4]],
        "type": raw.get("type"),
        "source": "openalex",
    }


# ---------------------------------------------------------------- polymer rubric

TIER_A_VENUES = (
    "macromolecules", "progress in polymer science", "polymer", "acs macro letters",
    "macromolecular rapid communications", "biomacromolecules",
    "journal of membrane science",
)
TIER_B_VENUES = (
    "european polymer journal", "polymer international",
    "journal of applied polymer science", "acs applied polymer materials",
    "polymer chemistry", "journal of polymer science", "soft matter",
    "carbohydrate polymers", "composites science and technology",
    "polymer degradation and stability", "materials & design",
    "composites part a", "composites part b-engineering",
    "journal of materials science",
)
TIER_C_VENUES = (
    "polymers", "rsc advances", "polymer bulletin", "journal of polymer research",
    "e-polymers", "polymer testing", "journal of elastomers and plastics",
    "gaofenzi xuebao", "高分子学报", "高分子材料科学与工程",
)
TIER_CROSS_VENUES = (
    "nature materials", "nature communications", "science advances", "pnas",
    "journal of the american chemical society",
    "angewandte chemie international edition", "advanced materials",
    "advanced functional materials", "chemical reviews",
    "chemical society reviews",
)
VENUE_TIER_SCORES = {"a": 35, "b": 20, "c": 12, "cross": 30, "other": 5}
TOPIC_BASE_SCORES = {"polymer": 15, "materials": 8}
CORE_TERMS = (
    "polymer", "copolymer", "poly(vinyl alcohol)", "polyvinyl alcohol", "pva",
    "biaxial stretching", "uniaxial stretching", "biaxially stretched",
    "draw ratio", "crystallinity", "orientation", "birefringence",
    "waxs", "saxs", "ftir", "hermans", "glass transition", "viscoelastic",
    "chain orientation", "hydrogel", "elastomer", "film", "membrane",
    "molecular dynamics",
)
EXTENDED_TERMS = (
    "amorphous", "semi-crystalline", "free volume", "entanglement", "rheology",
    "melt spinning", "hot drawing", "heat setting", "optical film", "retardation",
    "polarizing", "strain hardening", "necking", "plastic deformation",
    "dsc", "young modulus", "tensile", "elongation", "crystalline",
    "lamellar", "spherulite",
)
TIER_SCORE_TABLE = {"a": 35, "b": 20, "c": 12, "cross": 30, "other": 5}


def venue_tier(name):
    """Classify one venue name into a/b/c/cross/other (config-driven)."""
    value = re.sub(r"\s+", " ", (name or "").strip().lower())
    from pm_science import litprofile

    tiers = litprofile.venue_tiers()
    tier_a = tuple(tiers.get("a") or TIER_A_VENUES)
    tier_b = tuple(tiers.get("b") or TIER_B_VENUES)
    tier_c = tuple(tiers.get("c") or TIER_C_VENUES)
    tier_cross = tuple(tiers.get("cross") or TIER_CROSS_VENUES)
    if value in tier_cross:
        return "cross"
    if value in tier_a:
        return "a"
    if value in tier_b:
        return "b"
    if value in tier_c:
        return "c"
    for known in tier_c:
        if known in value or value in known:
            return "c"
    return "other"


def score_candidate(candidate, now_year=None):
    """Deterministic polymer screening rubric v1 (docs/polymechanism/11 §5)."""
    from pm_science import litprofile

    now_year = int(now_year) if now_year else time.gmtime().tm_year
    title = candidate.get("title") or ""
    haystack = (title + " \u241f " + (candidate.get("abstract") or "")).lower()
    breakdown = {}
    reasons = []

    venue_scores = litprofile.scores("venue")
    tier = venue_tier(venue := (candidate.get("venue") or ""))
    breakdown["venue"] = int(venue_scores.get(tier, venue_scores.get("other", 5)))
    reasons.append("venue=%s tier=%s" % (venue or "unknown", tier))

    topic_scores = litprofile.scores("topic")
    topics = [t.lower() for t in (candidate.get("topics") or [])]
    topic_score = 0
    topic_hit = ""
    for key, base in topic_scores.items():
        if any(key in t for t in topics):
            if base > topic_score:
                topic_score = base
                topic_hit = key
    breakdown["topic"] = topic_score
    if topic_hit:
        reasons.append("topic match: %s" % topic_hit)

    lex_scores = litprofile.scores("lexicon")
    title_lower = title.lower()
    core_terms = litprofile.lexicon("core") or list(CORE_TERMS)
    extended_terms = litprofile.lexicon("extended") or list(EXTENDED_TERMS)
    core_hits = [t for t in core_terms if t in haystack]
    extended_hits = [t for t in extended_terms if t in haystack]
    lexicon = 0
    for term in core_hits:
        lexicon += int(lex_scores.get("core_term_title", 8)) if term in title_lower else int(lex_scores.get("core_term_text", 4))
    lexicon = min(lexicon, int(lex_scores.get("core_cap", 30))) + min(
        int(lex_scores.get("extended_per_hit", 2)) * len(extended_hits),
        int(lex_scores.get("extended_cap", 10)))
    breakdown["lexicon"] = lexicon
    if core_hits:
        reasons.append("core terms: %s" % ", ".join(core_hits[:6]))

    quality_scores = litprofile.scores("quality")
    cited = int(candidate.get("citedByCount") or 0)
    breakdown["quality"] = min(
        int(int(quality_scores.get("coefficient", 3)) * (cited ** 0.5) / int(quality_scores.get("divisor", 2))),
        int(quality_scores.get("cap", 10)))
    year = candidate.get("year")
    age = (now_year - int(year)) if isinstance(year, int) else 10
    grace = int(litprofile.scores("freshness").get("grace_years", 5))
    zero_at = int(litprofile.scores("freshness").get("zero_years", 15))
    if age > grace:
        span = max(1, zero_at - grace)
        freshness = max(0.0, min(5.0, 5.0 - (age - grace) / span * 5.0))
    else:
        freshness = 5.0
    breakdown["freshness"] = int(freshness)

    availability_scores = litprofile.scores("availability")
    oa_status = str(candidate.get("oaStatus") or "").lower()
    if oa_status in ("gold", "green", "hybrid", "bronze", "oa"):
        breakdown["availability"] = int(availability_scores.get("oa", 10))
    elif candidate.get("oaUrl"):
        breakdown["availability"] = int(availability_scores.get("oa_url", 8))
    elif candidate.get("doi"):
        breakdown["availability"] = int(availability_scores.get("doi_only", 6))
    else:
        breakdown["availability"] = int(availability_scores.get("none", 2))

    grade_thresholds = litprofile.grades()
    total = min(100, sum(breakdown.values()))
    grade = ("core" if total >= int(grade_thresholds.get("core", 70))
             else ("important" if total >= int(grade_thresholds.get("important", 45)) else "reference"))
    return {"total": total, "grade": grade, "breakdown": breakdown, "reasons": reasons}


# ---------------------------------------------------------------- search

def search_works(request):
    """query + optional year window + source selection -> scored candidates."""
    query = (request.get("query") or "").strip()
    if not query:
        return {"ok": False, "error": "query is required"}
    limit = min(max(int(request.get("maxResults") or 20), 1), 50)
    year_from = request.get("yearFrom")
    year_to = request.get("yearTo")
    sources = request.get("sources") or ["openalex"]
    candidates = []
    if "openalex" in sources:
        params = {"search": query, "per-page": limit, "mailto": MAILTO}
        filters = []
        if isinstance(year_from, int):
            filters.append("from_publication_date:%d-01-01" % year_from)
        if isinstance(year_to, int):
            filters.append("to_publication_date:%d-12-31" % year_to)
        if filters:
            params["filter"] = ",".join(filters)
        url = OPENALEX_API + "?" + urllib.parse.urlencode(params)
        payload = fetch_json(url)
        candidates = [openalex_work_to_candidate(item) for item in (payload.get("results") or [])]
    if "crossref" in sources and len(candidates) < limit:
        params = {
            "query": query,
            "rows": limit,
            "select": "DOI,title,container-title,issued,is-referenced-by-count,type,URL,subject",
        }
        url = CROSSREF_API + "?" + urllib.parse.urlencode(params)
        payload = fetch_json(url)
        seen = {c["doi"] for c in candidates if c.get("doi")}
        for item in (payload.get("message", {}).get("items") or []):
            doi_value = (item.get("DOI") or "").lower() or None
            if doi_value is None or doi_value in seen:
                continue
            seen.add(doi_value)
            issued = ((item.get("issued") or {}).get("date-parts") or [[None]])[0][0]
            candidates.append({
                "doi": doi_value,
                "title": (item.get("title") or [None])[0],
                "venue": (item.get("container-title") or [None])[0],
                "year": issued,
                "authors": [],
                "citedByCount": item.get("is-referenced-by-count") or 0,
                "oaStatus": "unknown",
                "oaUrl": None,
                "topics": [],
                "type": item.get("type"),
                "source": "crossref",
            })
    if request.get("screen") is not False:
        for candidate in candidates:
            candidate["screen"] = score_candidate(candidate)
    candidates.sort(key=lambda c: -(c.get("screen", {}).get("total", 0)))
    return {"ok": True, "query": query, "count": len(candidates), "candidates": candidates}


def screen_candidates(request):
    """Score a caller-supplied candidate list (offline, deterministic)."""
    candidates = request.get("candidates")
    if not isinstance(candidates, list) or not candidates:
        return {"ok": False, "error": "candidates must be a non-empty array"}
    now_year = request.get("nowYear")
    scored = []
    for candidate in candidates:
        item = dict(candidate)
        item["screen"] = score_candidate(item, int(now_year) if now_year else None)
        scored.append(item)
    scored.sort(key=lambda c: -c["screen"]["total"])
    return {"ok": True, "count": len(scored), "candidates": scored}


# ---------------------------------------------------------------- download chain

MANIFEST_NAME = "manifest.jsonl"


def require_contained_dir(raw_dir):
    """Validate a caller-supplied directory: non-empty, no `..` segments.

    Returns os.path.realpath(os.path.abspath(raw_dir)); raises ValueError on
    empty input or any parent-directory traversal segment.
    """
    value = str(raw_dir or "").strip()
    if not value:
        raise ValueError("target directory is required")
    if re.search(r"(^|[\\/])\.\.($|[\\/])", value):
        raise ValueError("PATH_ESCAPE: parent-directory segment in %r" % value)
    return os.path.realpath(os.path.abspath(value))


def _slug(text, limit):
    """Lowercase [a-z0-9-] slug capped at limit characters."""
    return re.sub(r"[^a-z0-9]+", "-", str(text or "").lower()).strip("-")[:limit].strip("-")


def normalize_doi(value):
    """Normalize a DOI: strip whitespace, doi.org prefixes, trailing punctuation."""
    doi_value = re.sub(r"^(?:https?://)?(?:dx\.)?doi\.org/", "", (value or "").strip(),
                       flags=re.IGNORECASE)
    return doi_value.strip().rstrip(".,;").lower()


def filename_for(meta, doi_value):
    """Deterministic safe filename: {year}_{author}_{title}__{doi-tail}.pdf.

    Every part is reduced to a lowercase [a-z0-9-] slug so the assembled
    name stays within [a-z0-9_.-] and needs no further escaping.
    """
    year_value = re.sub(r"[^0-9]", "", str(meta.get("year") or ""))[:4] or "unknown"
    authors = meta.get("authors") or []
    author_slug = _slug(authors[0] if authors else "", 16) or "unknown"
    title_slug = _slug(meta.get("title") or "", 60) or "unknown"
    doi_tail = _slug(str(doi_value or "").rsplit("/", 1)[-1], 24) or "doi"
    return "%s_%s_%s__%s.pdf" % (year_value, author_slug, title_slug, doi_tail)


def save_pdf(target_dir, filename, payload):
    """Containment-checked binary write of one PDF; returns the saved realpath."""
    base_real = os.path.realpath(target_dir)
    resolved = os.path.realpath(os.path.join(base_real, filename))
    if os.path.commonpath([base_real, resolved]) != base_real:
        raise ValueError("PATH_ESCAPE: %s is outside %s" % (filename, target_dir))
    with open(resolved, "wb") as handle:
        handle.write(payload)
    return resolved


def manifest_entry(target_dir, entry):
    """Dedupe-aware append of one JSON line to target_dir/MANIFEST_NAME.

    Returns (record, deduped): an existing DOWNLOADED record for the same doi
    wins; otherwise the entry gains downloadedAt and is appended.
    """
    base_real = os.path.realpath(target_dir)
    resolved = os.path.realpath(os.path.join(base_real, MANIFEST_NAME))
    if os.path.commonpath([base_real, resolved]) != base_real:
        raise ValueError("PATH_ESCAPE: %s is outside %s" % (MANIFEST_NAME, target_dir))
    existing = []
    if os.path.exists(resolved):
        with open(resolved, "r", encoding="utf-8") as handle:
            for line in handle:
                line = line.strip()
                if not line:
                    continue
                try:
                    existing.append(json.loads(line))
                except json.JSONDecodeError:
                    continue
    if entry.get("status") == "DOWNLOADED":
        for prior in existing:
            if prior.get("status") == "DOWNLOADED" and prior.get("doi") == entry.get("doi"):
                return prior, True
    record = dict(entry)
    record.setdefault("downloadedAt", time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()))
    if os.path.commonpath([base_real, resolved]) != base_real:
        raise ValueError("PATH_ESCAPE: %s is outside %s" % (MANIFEST_NAME, target_dir))
    with open(resolved, "a", encoding="utf-8") as handle:
        handle.write(json.dumps(record, ensure_ascii=False, sort_keys=True) + "\n")
    return record, False


def download_doi(request):
    """Resolve one DOI through the OA chain and save its PDF into targetDir.

    Branch order: arxiv -> openalex OA link -> unpaywall -> crossref links.
    Every branch records an attempt entry; nothing bypasses a paywall.
    """
    doi_value = normalize_doi(request.get("doi"))
    if not doi_value:
        return {"ok": False, "error": "doi is required"}
    try:
        target_dir = require_contained_dir(request.get("targetDir"))
    except ValueError as cause:
        return {"ok": False, "error": str(cause)}
    os.makedirs(target_dir, exist_ok=True)

    meta = {
        "doi": doi_value,
        "title": "",
        "venue": "",
        "year": None,
        "authors": [],
        "citedByCount": 0,
        "oaStatus": "unknown",
        "oaUrl": None,
        "topics": [],
        "type": None,
        "source": "request",
    }
    try:
        url = (OPENALEX_API + "/" + urllib.parse.quote("doi:" + doi_value, safe="")
               + "?mailto=" + urllib.parse.quote(MAILTO, safe=""))
        top_up = openalex_work_to_candidate(fetch_json(url))
        meta.update({key: value for key, value in top_up.items() if value})
        meta["doi"] = doi_value
    except (UrlBlocked, urllib.error.URLError, json.JSONDecodeError):
        pass

    filename = filename_for(meta, doi_value)
    attempts = []
    landing_url = DOI_RESOLVER + urllib.parse.quote(doi_value, safe="")

    def finish(status, **fields):
        record = {
            "doi": doi_value,
            "title": meta.get("title") or "",
            "filename": filename,
            "status": status,
        }
        record.update(fields)
        record, deduped = manifest_entry(target_dir, record)
        result = {
            "ok": status == "DOWNLOADED",
            "doi": doi_value,
            "status": status,
            "targetDir": target_dir,
            "landingUrl": landing_url,
            "attempts": attempts,
            "manifestDeduped": deduped,
            "manifestEntry": record,
        }
        result.update(fields)
        return result

    def attempt(source, url):
        entry = {"source": source, "url": url}
        attempts.append(entry)
        try:
            payload, content_type, _jar = download_bytes(url)
        except (UrlBlocked, urllib.error.URLError) as cause:
            entry["error"] = str(cause)
            return None
        if not is_pdf_payload(payload):
            entry["contentType"] = content_type
            entry["note"] = "not a PDF"
            return None
        path = save_pdf(target_dir, filename, payload)
        entry["saved"] = path
        return finish("DOWNLOADED", source=source, path=path)

    result = None
    arxiv_id = arxiv_id_of(doi_value)
    if arxiv_id:
        result = attempt("arxiv", ARXIV_PDF + arxiv_id)
    if result is None and meta.get("oaUrl"):
        result = attempt("openalex-oa", meta["oaUrl"])
    saw_oa_link = bool(meta.get("oaUrl"))
    if result is None:
        unpaywall_url = unpaywall_pdf_url(doi_value)
        if unpaywall_url:
            saw_oa_link = True
            result = attempt("unpaywall", unpaywall_url)
    if result is None:
        for link in crossref_pdf_urls(doi_value):
            result = attempt("crossref", link)
            if result is not None:
                break
    if result is not None:
        return result
    if saw_oa_link:
        return finish("OA_LINK_ONLY",
                      note="OA landing page exists but no direct PDF payload was served")
    return finish("MANUAL_REQUIRED", note="no OA source; publisher chain gave no PDF")
