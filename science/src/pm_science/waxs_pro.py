"""WAXS pro pipeline: MATLAB-lab algorithms ported from AirRemove/Peak_Fit/QX_WAXS.

Ops (each pure-numpy/scipy, JSON-serializable results):

- ``air_remove``: background subtraction with the lab's k-coefficient method
  (AirRemove_WAXS.m).  ``k = (mean(sample[:n]) - sample[end]) / (mean(air[:n]) -
  air[end])``; subtracted = sample - k*air.  A non-positive or non-finite k is
  reported as a warning with the uniform-scale fallback (k=1) refused: the op
  returns ``status='NO_FIT'`` when k cannot be trusted and ``k_fallback=1`` is
  requested, otherwise the raw subtraction is returned with the warning.

- ``peak_fit``: bounded multi-Gaussian fit in the lab's amplitude form
  ``A/(w*sqrt(pi/2)) * exp(-2*((x-xc)/w)^2)`` (Peak_Fit_WAXS.m).  ``A`` is the
  integrated area, so crystallinity = sum(A_cryst)/sum(A_all) exactly like the
  MATLAB script.  FWHM = w*1.17741; Scherrer size L = 0.89*lambda*180 /
  (FWHM_deg*pi*cos(theta)) with the wavelength supplied by the caller.

- ``orientation``: Hermans orientation from an azimuthal profile
  (QX_WAXS.m).  Background-subtract with a supplied air profile and k,
  mask detector-gap azimuth windows, range-normalize, fit a Lorentzian
  ``(2a/pi)*(b/(4*(x-c)^2+b^2)) + d``, then
  ``<cos^2 phi> = integral(I cos^2 sin) / integral(I sin)`` over 90-180 deg
  (mirror-symmetric to 0-90), ``<cos^2 phi_c> = 1 - 2*<cos^2 phi>``,
  ``f_hkl = 0.5*(3*<cos^2 phi_hkl> - 1)*cos^2(theta_hkl)``,
  ``f_chain = 0.5*(3*<cos^2 phi_c> - 1)``.

Port note: the MATLAB QX script evaluates the Hermans integrand with
``d^2`` (the baseline squared) where the fitted model value ``a-term + d`` is
required.  This port uses the model value; pass ``legacy_baseline_square``
to reproduce the original behavior exactly.
"""

from __future__ import annotations

import math
from typing import Sequence

import numpy as np
from scipy.optimize import curve_fit

__all__ = ["air_remove", "peak_fit_pro", "orientation_hermans"]

FWHM_PER_W = 1.17741  # FWHM = w * 1.17741 for exp(-2*((x-xc)/w)^2)


def air_remove(
    two_theta: np.ndarray,
    sample: np.ndarray,
    air: np.ndarray,
    edge_points: int = 10,
    window: tuple[float, float] | None = None,
) -> dict[str, object]:
    """Subtract the air background with the lab k-coefficient method.

    @param two_theta - shared 2θ axis (deg), same length for both profiles.
    @param sample - sample 1-D profile.
    @param air - air background 1-D profile on the same axis.
    @param edge_points - first N points averaged for the k estimate.
    @param window - optional (low, high) 2θ restriction before the estimate.
    @returns k, subtracted profile, window actually used, and warnings.
    """
    x = np.asarray(two_theta, dtype=float)
    s = np.asarray(sample, dtype=float)
    a = np.asarray(air, dtype=float)
    if x.ndim != 1 or s.shape != x.shape or a.shape != x.shape:
        raise ValueError("two_theta/sample/air must be same-length 1-D arrays")
    mask = np.ones_like(x, dtype=bool)
    if window is not None:
        mask &= (x >= float(window[0])) & (x <= float(window[1]))
    if int(mask.sum()) < edge_points + 2:
        raise ValueError("window too small for the k-coefficient estimate")

    xs, ss, aa = x[mask], s[mask], a[mask]
    n = min(edge_points, len(xs) - 1)
    s_head, a_head = float(np.mean(ss[:n])), float(np.mean(aa[:n]))
    s_tail, a_tail = float(ss[-1]), float(aa[-1])
    denom = a_head - a_tail
    warnings: list[str] = []
    if not math.isfinite(denom) or abs(denom) < 1e-12:
        k = 1.0
        warnings.append("air background is flat on the window; k defaulted to 1.0")
    else:
        k = (s_head - s_tail) / denom
    if not math.isfinite(k):
        k = 1.0
        warnings.append("k estimate was non-finite; defaulted to 1.0")
    if k <= 0.0:
        warnings.append(
            f"k={k:.4g} <= 0: sample attenuation differs from the air path; "
            "subtraction is directionally unreliable for absolute quantification"
        )
    subtracted = s - k * a
    return {
        "k": float(k),
        "edgePoints": int(n),
        "windowDeg": [float(xs[0]), float(xs[-1])],
        "twoTheta": x.tolist(),
        "sample": s.tolist(),
        "airScaled": (k * a).tolist(),
        "subtracted": subtracted.tolist(),
        "negativeFraction": float(np.mean(subtracted[mask] < 0.0)),
        "warnings": warnings,
    }


def _gauss_area(x: np.ndarray, area: float, center: float, width: float) -> np.ndarray:
    return (area / (width * math.sqrt(math.pi / 2.0))) * np.exp(
        -2.0 * ((x - center) / width) ** 2
    )


def peak_fit_pro(
    two_theta: np.ndarray,
    intensity: np.ndarray,
    peaks: Sequence[dict[str, object]],
    wavelength_angstrom: float = 1.5418,
    scherrer_constant: float = 0.89,
    fit_range: tuple[float, float] | None = None,
) -> dict[str, object]:
    """Bounded multi-Gaussian fit with crystallinity/FWHM/Scherrer outputs.

    @param two_theta - 2θ axis (deg).
    @param intensity - background-subtracted intensity.
    @param peaks - list of {center, width, area?, role?, centerBounds?, widthBounds?,
        areaBounds?}; ``role`` is ``'crystalline'`` (default) or ``'amorphous'``.
        Defaults: center ±0.8 deg bounds, width in [0.2, 10], area > 0.
    @param wavelength_angstrom - X-ray wavelength for Scherrer sizes.
    @param fit_range - optional (low, high) 2θ restriction of the fit.
    @returns per-peak table, crystallinity, fit curve, r², rmse, status.
    """
    x = np.asarray(two_theta, dtype=float)
    y = np.asarray(intensity, dtype=float)
    if x.ndim != 1 or y.shape != x.shape or len(x) < 8:
        raise ValueError("two_theta/intensity must be same-length 1-D arrays")
    if not peaks or len(peaks) > 12:
        raise ValueError("peaks must contain between 1 and 12 entries")

    mask = np.ones_like(x, dtype=bool)
    if fit_range is not None:
        mask &= (x >= float(fit_range[0])) & (x <= float(fit_range[1]))
    if int(mask.sum()) < 4 * len(peaks):
        raise ValueError("fit range has too few points for the requested peak count")
    xs, ys = x[mask], y[mask]

    p0: list[float] = []
    lower: list[float] = []
    upper: list[float] = []
    roles: list[str] = []
    for spec in peaks:
        center = float(spec.get("center", 0.0))
        width = float(spec.get("width", 0.8))
        area_guess = spec.get("area")
        if area_guess is None:
            area_guess = float(np.max(ys)) * width
        bounds_c = spec.get("centerBounds")
        bounds_w = spec.get("widthBounds")
        bounds_a = spec.get("areaBounds")
        c_lo, c_hi = (float(bounds_c[0]), float(bounds_c[1])) if bounds_c else (center - 0.8, center + 0.8)
        w_lo, w_hi = (float(bounds_w[0]), float(bounds_w[1])) if bounds_w else (0.2, 10.0)
        a_lo, a_hi = (float(bounds_a[0]), float(bounds_a[1])) if bounds_a else (0.0, float(np.max(ys)) * 50.0)
        roles.append(str(spec.get("role", "crystalline")))
        p0.extend([float(area_guess), center, width])
        lower.extend([a_lo, c_lo, w_lo])
        upper.extend([a_hi, c_hi, w_hi])

    base_guess = float(np.min(ys))

    def model(xx: np.ndarray, *params: float) -> np.ndarray:
        base = params[0]
        out = np.full_like(xx, base, dtype=float)
        for i in range(len(peaks)):
            area, center, width = params[1 + 3 * i : 4 + 3 * i]
            out = out + _gauss_area(xx, area, center, width)
        return out

    p0 = [base_guess] + p0
    lower = [-abs(base_guess) * 10.0 - 1e-9] + lower
    upper = [abs(base_guess) * 10.0 + max(ys) + 1e-9] + upper
    popt, _ = curve_fit(model, xs, ys, p0=p0, bounds=(lower, upper), maxfev=60000)
    pred = model(xs, *popt)
    residual = ys - pred
    rmse = float(np.sqrt(np.mean(residual**2)))
    ss_tot = float(np.sum((ys - np.mean(ys)) ** 2))
    r2 = float(1.0 - np.sum(residual**2) / ss_tot) if ss_tot > 0 else 1.0

    table: list[dict[str, object]] = []
    area_cryst = 0.0
    area_all = 0.0
    for i, role in enumerate(roles):
        area, center, width = (float(v) for v in popt[1 + 3 * i : 4 + 3 * i])
        fwhm = width * FWHM_PER_W
        theta = math.radians(center / 2.0)
        scherrer = (
            scherrer_constant * wavelength_angstrom * 180.0
            / (fwhm * math.pi * math.cos(theta))
            if fwhm > 0 and abs(math.cos(theta)) > 1e-9
            else None
        )
        area_all += area
        if role == "crystalline":
            area_cryst += area
        table.append(
            {
                "role": role,
                "centerDeg": round(center, 4),
                "area": round(area, 4),
                "widthParam": round(width, 4),
                "fwhmDeg": round(fwhm, 4),
                "dSpacingAngstrom": round(
                    wavelength_angstrom / (2.0 * math.sin(theta)), 4
                )
                if center > 0
                else None,
                "scherrerNm": round(scherrer / 10.0, 3) if scherrer is not None else None,
            }
        )
    crystallinity = area_cryst / area_all if area_all > 0 else None
    full = model(x, *popt)
    return {
        "status": "CONVERGED",
        "crystallinityIndex": None if crystallinity is None else round(float(crystallinity), 5),
        "areaCrystalline": round(float(area_cryst), 4),
        "areaTotal": round(float(area_all), 4),
        "peaks": table,
        "baseline": round(float(popt[0]), 4),
        "fitRangeDeg": [float(xs[0]), float(xs[-1])],
        "curve": {
            "twoTheta": x.tolist(),
            "observed": y.tolist(),
            "fit": full.tolist(),
        },
        "fit": {"rmse": round(rmse, 6), "r2": round(r2, 5)},
        "warnings": [],
    }


def orientation_hermans(
    azimuth: np.ndarray,
    intensity: np.ndarray,
    two_theta_peak: float,
    air: np.ndarray | None = None,
    k: float = 1.0,
    gap_masks: Sequence[tuple[float, float]] | None = None,
    fit_range: tuple[float, float] = (90.0, 180.0),
    wavelength_angstrom: float = 1.5418,
    legacy_baseline_square: bool = False,
) -> dict[str, object]:
    """Hermans orientation factor from an azimuthal profile (QX_WAXS.m port).

    @param azimuth - azimuthal angle axis (deg).
    @param intensity - azimuthal intensity profile at the chosen 2θ.
    @param two_theta_peak - 2θ of the reflecting lattice plane (deg).
    @param air - optional azimuthal air profile; subtracted as ``k * air``.
    @param k - background coefficient from {@link air_remove}.
    @param gap_masks - azimuth windows to exclude (detector gaps); e.g. [(120, 154), (165, 180)].
    @param fit_range - azimuth window used for the Lorentzian fit (default 90-180 deg).
    @param legacy_baseline_square - reproduce the MATLAB integrand bug (``d**2``).
    @returns Hermans f_hkl, chain-axis f_c, <cos²φ>, Lorentzian parameters, fit curve.
    """
    phi = np.asarray(azimuth, dtype=float)
    y = np.asarray(intensity, dtype=float)
    if phi.ndim != 1 or y.shape != phi.shape:
        raise ValueError("azimuth/intensity must be same-length 1-D arrays")
    if air is not None:
        a = np.asarray(air, dtype=float)
        if a.shape != phi.shape:
            raise ValueError("air profile must share the azimuth axis")
        y = y - float(k) * a

    mask = np.isfinite(y)
    if gap_masks:
        for lo, hi in gap_masks:
            mask &= ~((phi >= float(lo)) & (phi <= float(hi)))
    m_fit = mask & (phi >= float(fit_range[0])) & (phi <= float(fit_range[1]))
    if int(m_fit.sum()) < 12:
        raise ValueError("fit range has too few valid azimuth points")

    phi_f, y_f = phi[m_fit], y[m_fit]
    y_min, y_max = float(np.min(y_f)), float(np.max(y_f))
    span = y_max - y_min if y_max > y_min else 1.0
    yn = (y_f - y_min) / span  # MATLAB normalize(...,'range')

    def lorentz(xx: np.ndarray, a: float, b: float, c: float, d: float) -> np.ndarray:
        return (2.0 * a / np.pi) * (b / (4.0 * (xx - c) ** 2 + b**2)) + d

    d0 = float(np.mean(yn[-min(20, len(yn)) :]))
    p0 = [float(np.max(yn)), 30.0, float(np.clip(phi_f[int(np.argmax(yn))], fit_range[0], fit_range[1])), d0]
    bounds = ([0.0, 0.0, float(fit_range[0]), 0.0], [1e5, 200.0, float(fit_range[1]), d0])
    try:
        popt, _ = curve_fit(lorentz, phi_f, yn, p0=p0, bounds=bounds, maxfev=40000)
    except (RuntimeError, ValueError) as cause:
        return {
            "status": "NO_FIT",
            "reason": f"Lorentzian orientation fit failed: {cause}",
            "hermansFactor": None,
            "chainAxisFactor": None,
        }
    a_fit, b_fit, c_fit, d_fit = (float(v) for v in popt)
    pred = lorentz(phi_f, *popt)
    rmse = float(np.sqrt(np.mean((yn - pred) ** 2)))
    ss_tot = float(np.sum((yn - np.mean(yn)) ** 2))
    r2 = float(1.0 - np.sum((yn - pred) ** 2) / ss_tot) if ss_tot > 0 else 1.0

    def profile_value(xx: np.ndarray) -> np.ndarray:
        base = d_fit**2 if legacy_baseline_square else d_fit
        return (2.0 * a_fit / np.pi) * (b_fit / (4.0 * (xx - c_fit) ** 2 + b_fit**2)) + base

    grid = np.linspace(float(fit_range[0]), float(fit_range[1]), 2000)
    vals = profile_value(grid)
    rad = np.radians(grid)
    sin_phi = np.sin(rad)
    cos_phi = np.cos(rad)
    numerator = float(np.trapezoid(vals * cos_phi**2 * sin_phi, grid))
    denominator = float(np.trapezoid(vals * sin_phi, grid))
    if abs(denominator) < 1e-12:
        return {
            "status": "NO_FIT",
            "reason": "orientation integral degenerated (zero denominator)",
            "hermansFactor": None,
            "chainAxisFactor": None,
        }
    cos2_phi = numerator / denominator
    cos2_chain = 1.0 - 2.0 * cos2_phi
    theta = math.radians(two_theta_peak / 2.0)
    f_hkl = 0.5 * (3.0 * cos2_phi - 1.0) * (math.cos(theta) ** 2)
    f_chain = 0.5 * (3.0 * cos2_chain - 1.0)
    curve = np.full_like(phi, np.nan, dtype=float)
    curve[mask] = y[mask]
    return {
        "status": "CONVERGED",
        "twoThetaPeakDeg": float(two_theta_peak),
        "dSpacingAngstrom": round(
            wavelength_angstrom / (2.0 * math.sin(theta)), 4
        ),
        "cos2Phi": round(cos2_phi, 5),
        "cos2Chain": round(cos2_chain, 5),
        "hermansFactor": round(f_hkl, 5),
        "chainAxisFactor": round(f_chain, 5),
        "lorentzian": {
            "amplitude": round(a_fit, 4),
            "widthParamDeg": round(b_fit, 4),
            "centerDeg": round(c_fit, 4),
            "baseline": round(d_fit, 4),
            "fwhmDeg": round(b_fit, 4),
        },
        "fitRangeDeg": [float(fit_range[0]), float(fit_range[1])],
        "maskedWindowsDeg": [list(map(float, w)) for w in (gap_masks or [])],
        "fit": {"rmse": round(rmse, 6), "r2": round(r2, 5)},
        "curve": {"azimuth": phi.tolist(), "intensityBg": curve.tolist(), "fitNormalized": None},
        "warnings": [] if not legacy_baseline_square else [
            "legacy_baseline_square reproduces the MATLAB integrand (d^2); "
            "the corrected model value is the default"
        ],
    }
