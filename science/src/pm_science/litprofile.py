"""Load the polymer literature screening profile (config/literature-profile.polymer.yml).

The profile externalizes the rubric tables built into litsearch.py: venue
tiers, lexicon, scoring weights and grade thresholds. Missing or malformed
config falls back to the built-in tables, so the screening tool stays
deterministic without the file. Set ``PM_LIT_PROFILE`` to point at an
alternative profile file.
"""

import json
import os
from pathlib import Path

import yaml

DEFAULT_PROFILE_FILENAME = "literature-profile.polymer.yml"

# Built-in fallback, mirroring the shipped config/literature-profile.polymer.yml.
FALLBACK = {
    "scores": {
        "venue": {"a": 35, "b": 20, "c": 12, "cross": 30, "other": 5},
        "topic": {"polymer": 15, "materials": 8},
        "lexicon": {
            "core_term_title": 8,
            "core_term_text": 4,
            "core_cap": 30,
            "extended_per_hit": 2,
            "extended_cap": 10,
        },
        "quality": {"coefficient": 3, "divisor": 2, "cap": 10},
        "freshness": {"grace_years": 5, "zero_years": 15},
        "availability": {"oa": 10, "oa_url": 8, "doi_only": 6, "none": 2},
    },
    "grades": {"core": 70, "important": 45},
}

_STATE = {"profile": None}


def _candidate_paths():
    paths = []
    env = os.environ.get("PM_LIT_PROFILE")
    if env:
        paths.append(Path(env))
    here = Path(__file__).resolve()
    # <repo>/science/src/pm_science/litprofile.py -> <repo>/config
    paths.append(here.parents[3] / "config" / DEFAULT_PROFILE_FILENAME)
    return paths


def load_profile():
    """Return (profile_dict, source_path_or_None); caches per process."""
    if _STATE["profile"] is not None:
        return _STATE["profile"]
    for path in _candidate_paths():
        try:
            raw = yaml.safe_load(path.read_text(encoding="utf-8"))
        except (OSError, yaml.YAMLError):
            continue
        if isinstance(raw, dict):
            _STATE["profile"] = {"source": str(path), **raw}
            return _STATE["profile"]
    _STATE["profile"] = {"source": None, **FALLBACK}
    return _STATE["profile"]


def scores(section):
    """Merged scores dict for one rubric section (config over fallback)."""
    profile = load_profile()
    configured = ((profile.get("scores") or {}).get(section)) or {}
    built_in = FALLBACK["scores"].get(section) or {}
    return {**built_in, **configured}


def grades():
    profile = load_profile()
    configured = profile.get("grades") or {}
    return {**FALLBACK["grades"], **configured}


def lexicon(section):
    """One lexicon list from config; empty list falls back to litsearch tables."""
    profile = load_profile()
    entries = ((profile.get("lexicon") or {}).get(section)) or []
    return [str(entry).strip().lower() for entry in entries if str(entry).strip()]


def venue_tiers():
    """Mapping tier -> list of venue names, from config (empty when absent)."""
    profile = load_profile()
    tiers = profile.get("venue_tiers") or {}
    result = {}
    for tier, names in tiers.items():
        result[str(tier).replace("tier_", "")] = [
            re_space(name) for name in names or []
        ]
    return result


def re_space(name):
    return " ".join(str(name).split()).lower()


def summary():
    """One-line provenance summary for health/acceptance reporting."""
    profile = load_profile()
    return json.dumps({
        "profile": profile.get("profile") or "polymer",
        "source": profile.get("source"),
        "version": profile.get("version"),
    }, ensure_ascii=False)
