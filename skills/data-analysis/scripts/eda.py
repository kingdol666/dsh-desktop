#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Read-only exploratory data analysis for polymer measurement/simulation tables.

Standard library only (Python 3.8+), so it runs with the DSH bundled runtime,
a pyenv-created environment, or any system Python without pandas/numpy ABI risk.

Usage:
    python eda.py data.csv [--group COLUMN] [--target COLUMN] [--json]

Reports:
  - per-column type, missing count, unique count, five-number summary, skew/kurtosis
  - IQR outliers (flagged, never removed)
  - pairwise Pearson and Spearman correlations on complete pairs
  - optional group summaries with Cohen's d / eta^2 and Welch t / one-way ANOVA
  - Benjamini-Hochberg correction over the tests it actually computed

The script never rewrites the input and never invents a p-value.
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import math
import sys
from pathlib import Path
from typing import Any, Iterable

MISSING = {"", "na", "n/a", "null", "none", "nan", "-", "--"}


def _num(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, float):
        if math.isnan(value) or math.isinf(value):
            return None
        return value
    return value


def _to_float(text: str) -> float | None:
    raw = text.strip()
    if raw.lower() in MISSING:
        return None
    try:
        return float(raw)
    except ValueError:
        return None


def read_table(path: Path, max_rows: int) -> tuple[list[str], list[list[str]]]:
    if path.suffix.lower() in {".xlsx", ".xls"}:
        raise ValueError("Excel files are not read directly; save the sheet as CSV first")
    last_error: Exception | None = None
    for encoding in ("utf-8-sig", "gb18030"):
        try:
            text = path.read_text(encoding=encoding)
            break
        except UnicodeDecodeError as exc:
            last_error = exc
    else:
        raise ValueError(f"could not decode the file: {last_error}")
    sample = text[:8192]
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=",\t;")
        delimiter = dialect.delimiter
    except csv.Error:
        delimiter = ","
    reader = csv.reader(io.StringIO(text), delimiter=delimiter)
    rows = [row for row in reader if any(cell.strip() != "" for cell in row)]
    if not rows:
        raise ValueError("the table is empty")
    header = [cell.strip() or f"col{i + 1}" for i, cell in enumerate(rows[0])]
    body = []
    for index, row in enumerate(rows[1:]):
        if index >= max_rows:
            raise ValueError(f"table has more than {max_rows} rows; raise --max-rows if intentional")
        if len(row) < len(header):
            row = row + [""] * (len(header) - len(row))
        body.append(row[: len(header)])
    return header, body


def quantile(sorted_values: list[float], q: float) -> float | None:
    if not sorted_values:
        return None
    if len(sorted_values) == 1:
        return sorted_values[0]
    position = (len(sorted_values) - 1) * q
    lower = math.floor(position)
    upper = math.ceil(position)
    if lower == upper:
        return sorted_values[lower]
    weight = position - lower
    return sorted_values[lower] * (1 - weight) + sorted_values[upper] * weight


def mean(values: list[float]) -> float:
    return sum(values) / len(values)


def variance(values: list[float], ddof: int = 1) -> float:
    if len(values) <= ddof:
        return 0.0
    center = mean(values)
    return sum((value - center) ** 2 for value in values) / (len(values) - ddof)


def stdev(values: list[float]) -> float | None:
    if len(values) < 2:
        return None
    return math.sqrt(variance(values, 1))


def skewness(values: list[float]) -> float | None:
    n = len(values)
    if n < 3:
        return None
    sd = stdev(values)
    if not sd:
        return None
    center = mean(values)
    return (n / ((n - 1) * (n - 2))) * sum(((value - center) / sd) ** 3 for value in values)


def kurtosis(values: list[float]) -> float | None:
    n = len(values)
    if n < 4:
        return None
    sd = stdev(values)
    if not sd:
        return None
    center = mean(values)
    m4 = sum((value - center) ** 4 for value in values) / n
    return m4 / (sd**4) - 3.0


def iqr_flags(values: list[float]) -> dict[str, Any]:
    if len(values) < 4:
        return {"count": 0, "lower": None, "upper": None, "indices": []}
    ordered = sorted(values)
    q1 = quantile(ordered, 0.25)
    q3 = quantile(ordered, 0.75)
    assert q1 is not None and q3 is not None
    iqr = q3 - q1
    lower = q1 - 1.5 * iqr
    upper = q3 + 1.5 * iqr
    indices = [index for index, value in enumerate(values) if value < lower or value > upper]
    return {"count": len(indices), "lower": _num(lower), "upper": _num(upper), "indices": indices[:20]}


def ranks(values: list[float]) -> list[float]:
    order = sorted(range(len(values)), key=lambda index: values[index])
    result = [0.0] * len(values)
    position = 0
    while position < len(order):
        end = position
        while end + 1 < len(order) and values[order[end + 1]] == values[order[position]]:
            end += 1
        average = (position + end) / 2.0 + 1.0
        for cursor in range(position, end + 1):
            result[order[cursor]] = average
        position = end + 1
    return result


def pearson(left: list[float], right: list[float]) -> float | None:
    if len(left) < 3 or len(left) != len(right):
        return None
    mean_left, mean_right = mean(left), mean(right)
    covariance = sum((a - mean_left) * (b - mean_right) for a, b in zip(left, right))
    var_left = sum((a - mean_left) ** 2 for a in left)
    var_right = sum((b - mean_right) ** 2 for b in right)
    if var_left <= 0 or var_right <= 0:
        return None
    return covariance / math.sqrt(var_left * var_right)


def regularized_beta(x: float, a: float, b: float) -> float:
    """Regularized incomplete beta I_x(a,b) (Numerical Recipes continued fraction)."""
    if x <= 0.0:
        return 0.0
    if x >= 1.0:
        return 1.0
    log_beta = math.lgamma(a + b) - math.lgamma(a) - math.lgamma(b)
    front = math.exp(log_beta + a * math.log(x) + b * math.log(1.0 - x))
    if x < (a + 1.0) / (a + b + 2.0):
        return front * _beta_continued(x, a, b) / a
    return 1.0 - front * _beta_continued(1.0 - x, b, a) / b


def _beta_continued(x: float, a: float, b: float) -> float:
    tiny = 1e-30
    qab, qap, qam = a + b, a + 1.0, a - 1.0
    c = 1.0
    d = 1.0 - qab * x / qap
    if abs(d) < tiny:
        d = tiny
    d = 1.0 / d
    h = d
    for iteration in range(1, 300):
        m2 = 2 * iteration
        aa = iteration * (b - iteration) * x / ((qam + m2) * (a + m2))
        d = 1.0 + aa * d
        if abs(d) < tiny:
            d = tiny
        c = 1.0 + aa / c
        if abs(c) < tiny:
            c = tiny
        d = 1.0 / d
        h *= d * c
        aa = -(a + iteration) * (qab + iteration) * x / ((a + m2) * (qap + m2))
        d = 1.0 + aa * d
        if abs(d) < tiny:
            d = tiny
        c = 1.0 + aa / c
        if abs(c) < tiny:
            c = tiny
        d = 1.0 / d
        delta = d * c
        h *= delta
        if abs(delta - 1.0) < 1e-12:
            break
    return h


def student_t_sf(t_value: float, df: float) -> float:
    if df <= 0:
        return float("nan")
    x = df / (df + t_value * t_value)
    tail = 0.5 * regularized_beta(x, df / 2.0, 0.5)
    return tail


def f_sf(f_value: float, df1: float, df2: float) -> float:
    if f_value <= 0:
        return 1.0
    if df1 <= 0 or df2 <= 0:
        return float("nan")
    return regularized_beta(df2 / (df2 + df1 * f_value), df2 / 2.0, df1 / 2.0)


def bh_adjust(pvalues: list[float]) -> list[float]:
    if not pvalues:
        return []
    order = sorted(range(len(pvalues)), key=lambda index: pvalues[index])
    adjusted = [0.0] * len(pvalues)
    running = 1.0
    m = len(pvalues)
    for rank, index in reversed(list(enumerate(order, start=1))):
        value = min(running, pvalues[index] * m / rank)
        adjusted[index] = value
        running = value
    return adjusted


def describe(values: list[float | None], raw_texts: list[str]) -> dict[str, Any]:
    numeric = [value for value in values if value is not None]
    missing = len(values) - len(numeric)
    if numeric:
        ordered = sorted(numeric)
        return {
            "kind": "numeric",
            "missing": missing,
            "missingRatio": missing / len(values) if values else None,
            "n": len(numeric),
            "mean": _num(mean(numeric)),
            "std": _num(stdev(numeric)),
            "min": _num(ordered[0]),
            "q1": _num(quantile(ordered, 0.25)),
            "median": _num(quantile(ordered, 0.5)),
            "q3": _num(quantile(ordered, 0.75)),
            "max": _num(ordered[-1]),
            "skew": _num(skewness(numeric)),
            "kurtosis": _num(kurtosis(numeric)),
            "outliers": iqr_flags(numeric),
        }
    counts: dict[str, int] = {}
    missing = 0
    for text in raw_texts:
        if text.strip().lower() in MISSING:
            missing += 1
            continue
        counts[text.strip()] = counts.get(text.strip(), 0) + 1
    top = sorted(counts.items(), key=lambda item: (-item[1], item[0]))[:8]
    return {
        "kind": "categorical",
        "missing": missing,
        "missingRatio": missing / len(raw_texts) if raw_texts else None,
        "n": len(raw_texts) - missing,
        "unique": len(counts),
        "top": [{"value": key, "count": count} for key, count in top],
    }


def correlations(numeric_columns: list[str], columns: dict[str, list[float]]) -> dict[str, Any]:
    matrix: dict[str, dict[str, float | None]] = {name: {} for name in numeric_columns}
    pairs = []
    for i, left in enumerate(numeric_columns):
        for j, right in enumerate(numeric_columns):
            if i == j:
                matrix[left][right] = 1.0
                continue
            if j < i:
                continue
            x = columns[left]
            y = columns[right]
            paired = [(a, b) for a, b in zip(x, y) if a is not None and b is not None]
            if len(paired) < 3:
                value = None
            else:
                xs = [a for a, _ in paired]
                ys = [b for _, b in paired]
                value = pearson(xs, ys)
            matrix[left][right] = _num(value)
            matrix[right][left] = _num(value)
            if j > i:
                paired = [(a, b) for a, b in zip(x, y) if a is not None and b is not None]
                if len(paired) >= 3:
                    xs = [a for a, _ in paired]
                    ys = [b for _, b in paired]
                    pairs.append(
                        {
                            "a": left,
                            "b": right,
                            "n": len(paired),
                            "pearson": _num(pearson(xs, ys)),
                            "spearman": _num(pearson(ranks(xs), ranks(ys))),
                        }
                    )
    return {"pearsonMatrix": matrix, "pairs": pairs}


def group_analysis(
    group_values: list[str], target_values: list[float | None], group_name: str, target: str
) -> dict[str, Any]:
    buckets: dict[str, list[float]] = {}
    for group, value in zip(group_values, target_values):
        if value is None or group.strip() == "":
            continue
        buckets.setdefault(group, []).append(value)
    groups = []
    for name, values in sorted(buckets.items()):
        ordered = sorted(values)
        groups.append(
            {
                "group": name,
                "n": len(values),
                "mean": _num(mean(values)),
                "std": _num(stdev(values)),
                "median": _num(quantile(ordered, 0.5)),
                "q1": _num(quantile(ordered, 0.25)),
                "q3": _num(quantile(ordered, 0.75)),
            }
        )
    result: dict[str, Any] = {
        "groupColumn": group_name,
        "target": target,
        "groups": groups,
        "test": None,
        "statistic": None,
        "df": None,
        "pValue": None,
        "effectSize": None,
        "effectSizeName": None,
        "warnings": [],
    }
    arrays = [values for _, values in sorted(buckets.items()) if len(values) > 0]
    if len(arrays) < 2:
        result["warnings"].append("fewer than two non-empty groups; no test")
        return result
    if any(len(values) < 2 for values in arrays):
        result["warnings"].append("a group has n<2; variance-based test is not meaningful")

    if len(arrays) == 2:
        a, b = arrays[0], arrays[1]
        n1, n2 = len(a), len(b)
        var1 = variance(a, 1) if n1 > 1 else 0.0
        var2 = variance(b, 1) if n2 > 1 else 0.0
        if n1 > 1 and n2 > 1:
            pooled = math.sqrt(((n1 - 1) * var1 + (n2 - 1) * var2) / (n1 + n2 - 2))
            result["effectSize"] = _num((mean(a) - mean(b)) / pooled) if pooled > 0 else None
            result["effectSizeName"] = "cohen_d"
            result["test"] = "welch_t"
            se = math.sqrt(var1 / n1 + var2 / n2)
            if se > 0:
                t_value = (mean(a) - mean(b)) / se
                df = (var1 / n1 + var2 / n2) ** 2 / (
                    (var1 / n1) ** 2 / (n1 - 1) + (var2 / n2) ** 2 / (n2 - 1)
                )
                p_value = 2.0 * student_t_sf(abs(t_value), df)
                result.update(
                    {
                        "statistic": _num(t_value),
                        "df": _num(df),
                        "pValue": _num(min(1.0, max(0.0, p_value))),
                    }
                )
            else:
                result["warnings"].append("both groups have zero variance; Welch t is undefined")
    else:
        result["test"] = "one_way_anova"
        grand = [value for values in arrays for value in values]
        grand_mean = mean(grand)
        ss_between = sum(len(values) * (mean(values) - grand_mean) ** 2 for values in arrays)
        ss_within = sum(sum((value - mean(values)) ** 2 for value in values) for values in arrays)
        df_between = len(arrays) - 1
        df_within = len(grand) - len(arrays)
        if df_within > 0 and ss_within > 0:
            f_value = (ss_between / df_between) / (ss_within / df_within)
            result.update(
                {
                    "statistic": _num(f_value),
                    "df": [df_between, df_within],
                    "pValue": _num(min(1.0, max(0.0, f_sf(f_value, df_between, df_within)))),
                    "effectSize": _num(ss_between / (ss_between + ss_within)),
                    "effectSizeName": "eta_squared",
                }
            )
        else:
            result["warnings"].append("within-group variance is zero; ANOVA is undefined")
    return result


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description="Read-only EDA for CSV/TSV tables.")
    parser.add_argument("path", help="input table")
    parser.add_argument("--group", action="append", default=[], help="grouping column (repeatable)")
    parser.add_argument("--target", action="append", default=[], help="numeric target column (repeatable)")
    parser.add_argument("--json", action="store_true", help="emit JSON (the only output format)")
    parser.add_argument("--max-rows", type=int, default=200000, help="refuse larger tables")
    args = parser.parse_args(argv)

    path = Path(args.path)
    if not path.is_file():
        print(json.dumps({"ok": False, "error": f"file not found: {path}"}, ensure_ascii=False))
        return 2
    try:
        header, body = read_table(path, args.max_rows)
    except Exception as exc:
        print(json.dumps({"ok": False, "error": f"read failed: {exc}"}, ensure_ascii=False))
        return 2

    columns: dict[str, list[str]] = {name: [] for name in header}
    for row in body:
        for name, cell in zip(header, row):
            columns[name].append(cell)

    parsed: dict[str, list[float | None]] = {}
    numeric_columns: list[str] = []
    descriptions: dict[str, Any] = {}
    warnings_out: list[str] = []
    for name in header:
        values = [_to_float(cell) for cell in columns[name]]
        non_missing = [cell for cell in columns[name] if cell.strip().lower() not in MISSING]
        # A numeric column means every non-missing cell parses; missing cells are allowed.
        is_numeric = bool(non_missing) and all(
            value is not None for cell, value in zip(columns[name], values) if cell.strip().lower() not in MISSING
        )
        if is_numeric:
            parsed[name] = values
            numeric_columns.append(name)
        else:
            parsed[name] = [None] * len(values)
        descriptions[name] = describe(values if is_numeric else [None] * len(values), columns[name])
        if descriptions[name]["missingRatio"] is not None and descriptions[name]["missingRatio"] >= 0.3:
            warnings_out.append(f"{name}: {descriptions[name]['missingRatio']:.0%} missing")
        if is_numeric and descriptions[name]["n"] < 3:
            warnings_out.append(f"{name}: n<3, distribution statistics are weak")

    missing_targets = [name for name in args.target if name not in header]
    missing_groups = [name for name in args.group if name not in header]
    if missing_targets or missing_groups:
        print(
            json.dumps(
                {"ok": False, "error": f"unknown columns: {missing_targets + missing_groups}"},
                ensure_ascii=False,
            )
        )
        return 2

    target_columns = args.target or numeric_columns
    group_results = []
    for group_name in args.group:
        for target in target_columns:
            if group_name == target:
                continue
            if target not in numeric_columns:
                warnings_out.append(f"{target}: not numeric; skipped group test")
                continue
            group_results.append(
                group_analysis(columns[group_name], parsed[target], group_name, target)
            )

    pvalues = [item["pValue"] for item in group_results if item.get("pValue") is not None]
    if pvalues:
        adjusted = bh_adjust([float(value) for value in pvalues])
        cursor = 0
        for item in group_results:
            if item.get("pValue") is not None:
                item["pValueAdjusted"] = _num(adjusted[cursor])
                cursor += 1

    result = {
        "ok": True,
        "file": str(path.resolve()),
        "rows": len(body),
        "columns": header,
        "numericColumns": numeric_columns,
        "descriptions": descriptions,
        "correlations": correlations(numeric_columns, parsed),
        "groups": group_results,
        "warnings": warnings_out,
        "engine": {"python": sys.version.split()[0], "dependencies": "stdlib only"},
        "notes": [
            "IQR outliers are flagged, never removed.",
            "p-values are computed from the t/F distributions; never fabricate them.",
            "Statistical significance is not a mechanistic conclusion.",
        ],
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
