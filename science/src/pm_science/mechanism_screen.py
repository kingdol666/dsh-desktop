"""Data-driven competitive mechanism screening.

The engine evaluates every declared mechanism hypothesis against the whole
measured dataset, ranks them by quantitative consistency, and reports which
mechanisms survive, which are eliminated and where the surviving candidates
still disagree (the next discriminating experiment).

Pure functions only: the caller passes parsed CSV columns and hypothesis
specs, so no file or network access happens here. numpy is the only
dependency, matching the other science modules.

Hypothesis schema (one JSON object per mechanism):

{
  "id": "H1",
  "name": "strain-induced crystallization",
  "rationale": "affine stretching raises chain orientation ...",
  "terms": [
    {"response": "crystallinity", "form": "power", "factors": ["stretch_ratio"]},
    {"response": "birefringence", "form": "linear", "factors": ["stretch_ratio"]}
  ],
  "predictions": [
    {"response": "modulus", "direction": "+", "factor": "stretch_ratio"}
  ],
  "coefficient_signs": {"b1": ">0"},
  "weight": 1.0
}

Supported forms:
  linear          y = a + sum b_i x_i
  interaction     y = a + sum b_i x_i + sum_{i<j} b_ij x_i x_j
  quadratic       y = a + b1 x + b2 x^2                (single factor)
  log             y = a + b ln(x)
  power           y = A x^p                            (positive y and x)
  exp_saturation  y = a (1 - exp(-k x))
  exp_decay       y = a + b exp(-k x)
  arrhenius       y = A exp(-Ea / (R T))               (temperature in K)
"""

from __future__ import annotations

import math

import numpy as np

R_GAS = 8.314462618  # J/(mol K)

FORM_NAMES = (
    "linear",
    "interaction",
    "quadratic",
    "log",
    "power",
    "exp_saturation",
    "exp_decay",
    "arrhenius",
)

DEFAULT_OPTIONS = {
    "minR2": 0.8,
    "minAdjR2": 0.6,
    "directionMinRho": 0.25,
    "looMaxRows": 120,
}


def _as_float(value):
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def _column(columns, rows, name):
    """Extract one numeric column, or None when the column is absent."""
    if name not in columns:
        return None
    index = columns.index(name)
    values = []
    for row in rows:
        if index >= len(row):
            values.append(None)
            continue
        values.append(_as_float(row[index]))
    return values


def _spearman(xs, ys):
    pairs = [(x, y) for x, y in zip(xs, ys) if x is not None and y is not None]
    if len(pairs) < 3:
        return None
    x = np.array([p[0] for p in pairs], dtype=float)
    y = np.array([p[1] for p in pairs], dtype=float)
    rx = _rank(x)
    ry = _rank(y)
    if rx is None or ry is None:
        return None
    sx = rx.std()
    sy = ry.std()
    if sx == 0 or sy == 0:
        return None
    return float(np.mean((rx - rx.mean()) * (ry - ry.mean())) / (sx * sy))


def _rank(values):
    order = np.argsort(values, kind="mergesort")
    ranks = np.empty(len(values), dtype=float)
    i = 0
    while i < len(values):
        j = i
        while j + 1 < len(values) and values[order[j + 1]] == values[order[i]]:
            j += 1
        rank = (i + j) / 2.0 + 1.0
        for k in range(i, j + 1):
            ranks[order[k]] = rank
        i = j + 1
    return ranks


def _design_matrix(form, factor_arrays):
    """Return (basis matrix, parameter names, notes)."""
    n = len(factor_arrays[0])
    ones = np.ones(n)
    names = ["a"]
    columns = [ones]
    if form == "linear":
        for index, values in enumerate(factor_arrays):
            columns.append(values)
            names.append("b%d" % (index + 1))
        return np.column_stack(columns), names, []
    if form == "interaction":
        for index, values in enumerate(factor_arrays):
            columns.append(values)
            names.append("b%d" % (index + 1))
        for i in range(len(factor_arrays)):
            for j in range(i + 1, len(factor_arrays)):
                columns.append(factor_arrays[i] * factor_arrays[j])
                names.append("b%d_%d" % (i + 1, j + 1))
        return np.column_stack(columns), names, []
    if form == "quadratic":
        x = factor_arrays[0]
        columns = [ones, x, x * x]
        return np.column_stack(columns), ["a", "b1", "b2"], []
    if form == "log":
        x = factor_arrays[0]
        if np.any(x <= 0):
            return None, [], ["log form needs positive factor values"]
        columns = [ones, np.log(x)]
        return np.column_stack(columns), ["a", "b1"], []
    raise ValueError("form %s needs a specialised fit" % form)


def _weighted_lstsq(design, y, weights):
    sw = np.sqrt(weights)
    a = design * sw[:, None]
    b = y * sw
    solution, *_ = np.linalg.lstsq(a, b, rcond=None)
    return solution


def _fit_linear_like(form, factor_arrays, y, weights):
    design, names, notes = _design_matrix(form, factor_arrays)
    if design is None:
        return None
    if design.shape[0] <= design.shape[1]:
        return {"error": "too few rows for %s (%d rows, %d parameters)"
                          % (form, design.shape[0], design.shape[1])}
    try:
        params = _weighted_lstsq(design, y, weights)
    except np.linalg.LinAlgError as cause:
        return {"error": "fit failed: %s" % cause}
    prediction = design @ params
    return {"prediction": prediction, "params": dict(zip(names, params.tolist())), "k": int(design.shape[1]),
            "notes": notes, "design": design}


def _fit_power(factor_arrays, y, weights):
    x = factor_arrays[0]
    if np.any(x <= 0) or np.any(y <= 0):
        return {"error": "power form needs positive factor and response values"}
    log_x = np.log(x)
    log_y = np.log(y)
    design = np.column_stack([np.ones(len(x)), log_x])
    if design.shape[0] <= 2:
        return {"error": "power form needs at least 3 rows"}
    try:
        params = _weighted_lstsq(design, log_y, weights)
    except np.linalg.LinAlgError as cause:
        return {"error": "fit failed: %s" % cause}
    exponent = float(params[1])
    scale = float(math.exp(params[0]))
    prediction = scale * np.power(x, exponent)
    return {"prediction": prediction, "params": {"A": scale, "p": exponent}, "k": 2, "notes": []}


def _fit_k_grid(builder, x, y, weights, k_min=1e-3, k_max=1e3, samples=40):
    best = None
    for k in np.geomspace(k_min, k_max, samples):
        design = builder(x, k)
        if design is None:
            continue
        try:
            params = _weighted_lstsq(design, y, weights)
        except np.linalg.LinAlgError:
            continue
        residual = design @ params - y
        sse = float(np.sum(weights * residual * residual))
        if best is None or sse < best[0]:
            best = (sse, k, params, design)
    return best


def _fit_exp_saturation(factor_arrays, y, weights):
    x = factor_arrays[0]
    if np.any(x < 0):
        return {"error": "saturation form needs non-negative factor values"}
    def builder(values, k):
        return np.column_stack([1.0 - np.exp(-k * values)])
    best = _fit_k_grid(builder, x, y, weights)
    if best is None:
        return {"error": "saturation fit failed"}
    _, k, params, design = best
    return {"prediction": design @ params, "params": {"a": float(params[0]), "k": float(k)}, "k": 2, "notes": []}


def _fit_exp_decay(factor_arrays, y, weights):
    x = factor_arrays[0]
    if np.any(x < 0):
        return {"error": "decay form needs non-negative factor values"}
    def builder(values, k):
        return np.column_stack([np.ones(len(values)), np.exp(-k * values)])
    best = _fit_k_grid(builder, x, y, weights)
    if best is None:
        return {"error": "decay fit failed"}
    _, k, params, design = best
    return {"prediction": design @ params, "params": {"a": float(params[0]), "b": float(params[1]), "k": float(k)},
            "k": 3, "notes": []}


def _fit_arrhenius(factor_arrays, y, weights):
    t = factor_arrays[0]
    if np.any(t <= 0) or np.any(y <= 0):
        return {"error": "arrhenius form needs positive temperature (K) and response values"}
    design = np.column_stack([np.ones(len(t)), 1.0 / t])
    if design.shape[0] <= 2:
        return {"error": "arrhenius form needs at least 3 rows"}
    try:
        params = _weighted_lstsq(design, np.log(y), weights)
    except np.linalg.LinAlgError as cause:
        return {"error": "fit failed: %s" % cause}
    slope = float(params[1])
    ea_kj = -slope * R_GAS / 1000.0
    prediction = np.exp(design @ params)
    return {"prediction": prediction, "params": {"A": float(math.exp(params[0])), "Ea_kJmol": ea_kj},
            "k": 2, "notes": ["temperature assumed in kelvin"]}


def _fit(form, factor_arrays, y, weights):
    if form == "power":
        return _fit_power(factor_arrays, y, weights)
    if form == "exp_saturation":
        return _fit_exp_saturation(factor_arrays, y, weights)
    if form == "exp_decay":
        return _fit_exp_decay(factor_arrays, y, weights)
    if form == "arrhenius":
        return _fit_arrhenius(factor_arrays, y, weights)
    return _fit_linear_like(form, factor_arrays, y, weights)


def _metrics(y, prediction, weights, k):
    residual = prediction - y
    sse = float(np.sum(weights * residual * residual))
    mean = float(np.sum(weights * y) / np.sum(weights))
    sst = float(np.sum(weights * (y - mean) ** 2))
    n = len(y)
    r2 = 0.0 if sst == 0 else 1.0 - sse / sst
    adj = r2
    if n - k - 1 > 0:
        adj = 1.0 - (1.0 - r2) * (n - 1) / (n - k - 1)
    rmse = math.sqrt(sse / max(n, 1))
    mae = float(np.mean(np.abs(residual)))
    aicc = None
    if n > k + 1 and sse > 0:
        aicc = n * math.log(sse / n) + 2 * k + (2 * k * (k + 1)) / (n - k - 1)
    return {
        "n": n,
        "k": k,
        "r2": r2,
        "adjR2": adj,
        "rmse": rmse,
        "mae": mae,
        "aicc": aicc,
        "residuals": residual.tolist(),
    }


def _loo_rmse(form, factor_arrays, y, weights, k, max_rows):
    n = len(y)
    if n > max_rows or n <= k + 1:
        return None
    full_fit = _fit(form, factor_arrays, y, weights)
    if full_fit is None or "error" in full_fit:
        return None
    errors = []
    for leave in range(n):
        mask = np.ones(n, dtype=bool)
        mask[leave] = False
        sliced = [values[mask] for values in factor_arrays]
        fit = _fit(form, sliced, y[mask], weights[mask])
        if fit is None or "error" in fit:
            continue
        errors.append(abs(float(full_fit["prediction"][leave]) - float(y[leave])))
    return float(np.sqrt(np.mean(np.square(errors)))) if errors else None


def _evaluate_term(term, columns, rows, options, warnings):
    form = str(term.get("form", "linear"))
    response_name = term.get("response")
    factor_names = [str(name) for name in term.get("factors") or []]
    if response_name not in columns:
        return {"response": response_name, "error": "response column missing: %s" % response_name}
    if form not in FORM_NAMES:
        return {"response": response_name, "error": "unknown form %s" % form}
    y_raw = _column(columns, rows, response_name)
    factor_arrays = []
    used_mask = [value is not None for value in y_raw]
    for name in factor_names:
        values = _column(columns, rows, name)
        if values is None:
            return {"response": response_name, "error": "factor column missing: %s" % name}
        factor_arrays.append(values)
        used_mask = [m and v is not None for m, v in zip(used_mask, values)]
    if not factor_arrays:
        return {"response": response_name, "error": "no factors declared"}
    if form in ("quadratic", "log", "power", "exp_saturation", "exp_decay", "arrhenius") and len(factor_arrays) != 1:
        return {"response": response_name, "error": "%s form needs exactly one factor" % form}
    y_values = [v for v, m in zip(y_raw, used_mask) if m]
    arrays = []
    for values in factor_arrays:
        arrays.append(np.array([v for v, m in zip(values, used_mask) if m], dtype=float))
    y = np.array(y_values, dtype=float)
    dropped = int(len(y_raw) - len(y))
    if dropped:
        warnings.append("%s/%s: %d rows dropped for missing or non-numeric cells"
                        % (response_name, form, dropped))
    if len(y) < 4:
        return {"response": response_name, "error": "fewer than 4 complete rows"}
    weights = np.ones(len(y))
    uncertainty = options.get("uncertaintyColumn")
    if isinstance(uncertainty, str) and uncertainty:
        sigma = _column(columns, rows, uncertainty)
        if sigma is not None:
            selected = np.array([v for v, m in zip(sigma, used_mask) if m and v is not None and v > 0], dtype=float)
            if len(selected) == len(y):
                weights = 1.0 / np.square(selected)
            else:
                warnings.append("uncertainty column incomplete; unweighted fit used")
        else:
            warnings.append("uncertainty column missing; unweighted fit used")
    fit = _fit(form, arrays, y, weights)
    if fit is None:
        return {"response": response_name, "error": "fit returned nothing"}
    if "error" in fit:
        return {"response": response_name, "error": fit["error"]}
    metrics = _metrics(y, fit["prediction"], weights, fit["k"])
    loo = _loo_rmse(form, arrays, y, weights, fit["k"], int(options.get("looMaxRows", 120)))
    result = {
        "response": response_name,
        "form": form,
        "factors": factor_names,
        "params": fit.get("params", {}),
        "notes": fit.get("notes", []),
        "rmse": metrics["rmse"],
        "mae": metrics["mae"],
        "r2": metrics["r2"],
        "adjR2": metrics["adjR2"],
        "aicc": metrics["aicc"],
        "looRmse": loo,
        "n": metrics["n"],
        "k": metrics["k"],
        "predictions": {},
    }
    # Sign constraints on fitted coefficients.
    signs = term.get("coefficient_signs") or {}
    violations = []
    params = result["params"]
    for name, rule in signs.items():
        value = params.get(name)
        if value is None:
            continue
        if rule == ">0" and value <= 0:
            violations.append("coefficient %s should be >0 but is %.4g" % (name, value))
        if rule == "<0" and value >= 0:
            violations.append("coefficient %s should be <0 but is %.4g" % (name, value))
    result["signViolations"] = violations
    # Store predictions for discriminator analysis (only for single-factor forms).
    if len(factor_names) == 1:
        result["_fit"] = {
            "factor": factor_names[0],
            "values": arrays[0].tolist(),
            "x": arrays[0].tolist(),
            "prediction": fit["prediction"].tolist(),
            "y": y.tolist(),
            "weights": weights.tolist(),
        }
    return result


def _direction_checks(hypothesis, columns, rows, options, warnings):
    checks = []
    min_rho = float(options.get("directionMinRho", 0.25))
    for prediction in hypothesis.get("predictions") or []:
        if not isinstance(prediction, dict):
            continue
        response = str(prediction.get("response", ""))
        direction = prediction.get("direction")
        factor = str(prediction.get("factor", ""))
        if response not in columns:
            checks.append({"response": response, "factor": factor, "direction": direction,
                           "status": "missing", "detail": "response column missing"})
            continue
        if not factor:
            factor_names = [str(item) for item in hypothesis.get("terms", [{}])[0].get("factors", [])]
            factor = factor_names[0] if factor_names else ""
        if factor not in columns:
            checks.append({"response": response, "factor": factor, "direction": direction,
                           "status": "missing", "detail": "factor column missing"})
            continue
        rho = _spearman(_column(columns, rows, factor), _column(columns, rows, response))
        if rho is None:
            checks.append({"response": response, "factor": factor, "direction": direction,
                           "status": "undetermined", "rho": None,
                           "detail": "not enough numeric rows"})
            continue
        expected_positive = direction == "+"
        weak = abs(rho) < min_rho
        matched = (rho > 0) == expected_positive and not weak
        checks.append({
            "response": response,
            "factor": factor,
            "direction": direction,
            "rho": rho,
            "status": "ok" if matched else "violated",
            "detail": "weak trend" if weak else ("direction matches" if matched else "direction contradicts"),
        })
        if not matched:
            warnings.append("%s predicts %s %s with %s but rho=%.2f"
                            % (hypothesis.get("id", "?"), response, direction, factor, rho))
    return checks


def _candidate_columns(columns):
    numeric_like = []
    for name in columns:
        numeric_like.append(name)
    return numeric_like


def screen(payload):
    """Run one competitive mechanism screening pass."""
    columns = [str(name) for name in payload.get("columns") or []]
    rows = payload.get("rows") or []
    hypotheses = payload.get("hypotheses") or []
    options = dict(DEFAULT_OPTIONS)
    options.update({k: v for k, v in (payload.get("options") or {}).items() if v is not None})
    if not columns:
        raise ValueError("mechanism_screen requires at least one column")
    if not isinstance(hypotheses, list) or not hypotheses:
        raise ValueError("mechanism_screen requires a non-empty hypotheses list")
    global_warnings = []
    results = []
    for hypothesis in hypotheses:
        if not isinstance(hypothesis, dict):
            global_warnings.append("ignored non-object hypothesis entry")
            continue
        hypothesis_id = str(hypothesis.get("id") or "")
        if not hypothesis_id:
            global_warnings.append("ignored hypothesis without id")
            continue
        warnings = []
        rationale = str(hypothesis.get("rationale") or "").strip()
        if not rationale:
            warnings.append("missing scientific rationale; a mechanism without a basis is not admissible")
        terms = hypothesis.get("terms") or []
        term_results = []
        for term in terms:
            if not isinstance(term, dict):
                continue
            term_results.append(_evaluate_term(term, columns, rows, options, warnings))
        directional = _direction_checks(hypothesis, columns, rows, options, warnings)
        usable = [term for term in term_results if "error" not in term]
        violations = []
        required = [str(name) for name in options.get("requiredResponses") or []]
        covered = {term.get("response") for term in usable}
        for name in required:
            if name not in covered:
                violations.append("required response not modeled: %s" % name)
        for term in term_results:
            if "error" in term:
                violations.append("%s/%s: %s" % (term.get("response"), term.get("form"), term.get("error")))
            for sign in term.get("signViolations") or []:
                violations.append("%s/%s: %s" % (term.get("response"), term.get("form"), sign))
        for check in directional:
            if check["status"] == "violated":
                violations.append("prediction %s vs %s %s" % (check["response"], check["factor"], check["direction"]))
            elif check["status"] == "missing":
                violations.append("prediction column missing: %s" % check["response"])
        explains = bool(usable) and not violations
        scores = []
        weight_total = 0.0
        aicc_sum = 0.0
        for term in usable:
            weight = float(term.get("weight", 1.0)) if isinstance(term.get("weight"), (int, float)) else 1.0
            weight = max(weight, 0.0)
            scores.append(weight * float(term["r2"]))
            weight_total += weight
            if term.get("aicc") is not None:
                aicc_sum += float(term["aicc"])
            if float(term["r2"]) < float(options.get("minR2", 0.8)):
                explains = False
                violations.append("%s: r2=%.3f below %.2f" % (term["response"], term["r2"], options["minR2"]))
            if float(term.get("adjR2", -1.0)) < float(options.get("minAdjR2", 0.6)):
                explains = False
                violations.append("%s: adjusted r2=%.3f below %.2f" % (term["response"], term["adjR2"], options["minAdjR2"]))
        mean_r2 = (sum(scores) / weight_total) if weight_total > 0 else 0.0
        total_params = sum(int(term.get("k", 0)) for term in usable)
        penalty = 0.01 * total_params + 0.05 * len(violations)
        results.append({
            "id": hypothesis_id,
            "name": str(hypothesis.get("name") or hypothesis_id),
            "rationale": rationale,
            "weight": hypothesis.get("weight", 1.0),
            "terms": term_results,
            "predictions": directional,
            "warnings": warnings,
            "violations": violations,
            "explainsAll": explains,
            "meanR2": mean_r2,
            "score": mean_r2 - penalty,
            "aiccSum": aicc_sum if usable else None,
            "totalParams": total_params,
        })
    ranking = sorted(
        results,
        key=lambda item: (
            0 if item["explainsAll"] else 1,
            -item["score"],
            item["aiccSum"] if item["aiccSum"] is not None else float("inf"),
        ),
    )
    for index, item in enumerate(ranking):
        item["rank"] = index + 1
    survivors = [item["id"] for item in ranking if item["explainsAll"]]
    eliminated = [{"id": item["id"], "reasons": item["violations"] or ["terms unusable"]}
                  for item in ranking if not item["explainsAll"]]
    discriminators = _build_discriminators(ranking, options)
    next_experiments = _next_experiments(discriminators)
    gaps = _gaps(columns, rows, ranking, options)
    coverage = {}
    for item in ranking:
        for term in item.get("terms", []):
            if "error" in term:
                continue
            coverage.setdefault(term["response"], []).append(item["id"])
    return {
        "engine": {
            "rows": len(rows),
            "columns": columns,
            "usableColumns": _candidate_columns(columns),
        },
        "options": options,
        "ranking": [item["id"] for item in ranking],
        "best": ranking[0]["id"] if ranking else None,
        "survivors": survivors,
        "eliminated": eliminated,
        "hypotheses": ranking,
        "coverage": coverage,
        "discriminators": discriminators,
        "nextExperiments": next_experiments,
        "gaps": gaps,
        "warnings": global_warnings,
    }


def _build_discriminators(ranking, options):
    discriminators = {}
    for i in range(len(ranking)):
        for j in range(i + 1, len(ranking)):
            a = ranking[i]
            b = ranking[j]
            if not a.get("explainsAll") and not b.get("explainsAll"):
                continue
            pair = _pair_divergence(a, b)
            if pair is not None:
                discriminators["%s_vs_%s" % (a["id"], b["id"])] = pair
    return discriminators


def _pair_divergence(a, b):
    for term_a in a.get("terms", []):
        if "_fit" not in term_a:
            continue
        for term_b in b.get("terms", []):
            if "_fit" not in term_b:
                continue
            if term_a["response"] != term_b["response"]:
                continue
            fit_a = term_a["_fit"]
            fit_b = term_b["_fit"]
            if abs(len(fit_a["x"]) - len(fit_b["x"])) > 0:
                continue
            x = np.array(fit_a["x"], dtype=float)
            if not np.allclose(x, np.array(fit_b["x"], dtype=float)):
                continue
            pred_a = np.array(fit_a["prediction"], dtype=float)
            pred_b = np.array(fit_b["prediction"], dtype=float)
            delta = np.abs(pred_a - pred_b)
            if delta.size == 0 or float(delta.max()) == 0.0:
                continue
            noise = float(np.mean(fit_a["y"])) * 0.02 if np.mean(np.abs(fit_a["y"])) > 0 else 1.0
            scaled = delta / max(noise, 1e-12)
            index = int(np.argmax(scaled))
            return {
                "response": term_a["response"],
                "factor": fit_a["factor"],
                "observedPoint": float(x[index]),
                "predictedA": float(pred_a[index]),
                "predictedB": float(pred_b[index]),
                "difference": float(delta[index]),
                "relativeDifference": float(scaled[index]),
            }
    return None


def _next_experiments(discriminators):
    suggestions = []
    for key, value in discriminators.items():
        suggestions.append({
            "pair": key,
            "factor": value["factor"],
            "value": value["observedPoint"],
            "response": value["response"],
            "predictedDifference": value["difference"],
            "reason": "max predicted divergence between %s and %s on observed points"
                      % tuple(key.split("_vs_")),
        })
    suggestions.sort(key=lambda item: -item["predictedDifference"])
    return suggestions[:5]


def _gaps(columns, rows, ranking, options):
    gaps = []
    if len(rows) < 8:
        gaps.append("only %d rows; an orthogonal screening usually needs >=8 conditions" % len(rows))
    for item in ranking:
        for term in item.get("terms", []):
            if "error" in term:
                continue
            if term.get("r2") is not None and term["r2"] < float(options.get("minR2", 0.8)):
                gaps.append("%s/%s: r2=%.2f; collect more levels or replicate conditions"
                            % (item["id"], term["response"], term["r2"]))
            if term.get("looRmse") is not None and term.get("rmse", 0) > 0:
                if term["looRmse"] > 1.5 * term["rmse"]:
                    gaps.append("%s/%s: leave-one-out error %.3g exceeds 1.5x fit rmse; model may be overfitted"
                                % (item["id"], term["response"], term["looRmse"]))
    if not any(item["explainsAll"] for item in ranking):
        gaps.append("no hypothesis explains all responses within tolerance; add mechanisms or data")
    return gaps
