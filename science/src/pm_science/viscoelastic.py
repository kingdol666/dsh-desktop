"""Linear viscoelasticity: Rouse mode spectrum and WLF/VFT time-temperature shift."""

from __future__ import annotations

from typing import Literal

import numpy as np
from numpy.typing import NDArray

FloatArray = NDArray[np.float64]

BOLTZMANN_J_PER_K = 1.380649e-23  # J/K (SI exact)
WLF_UNIVERSAL_C1 = 17.44
WLF_UNIVERSAL_C2_K = 51.6


def rouse_spectrum(
    beads_per_chain: int,
    kuhn_length_nm: float,
    friction_per_bead: float,
    chain_number_density: float,
    temperature_k: float,
    *,
    modes_reported: int = 10,
    time_grid_s: tuple[float, float] = (1e-6, 1e4),
    time_points: int = 60,
    angular_freq_points: int = 40,
) -> dict[str, object]:
    """Rouse melt linear-viscoelastic spectrum (unentangled, no hydrodynamics).

    :param beads_per_chain: beads (Kuhn segments) per chain N.
    :param kuhn_length_nm: Kuhn length b (nm).
    :param friction_per_bead: monomer friction ζ (kg/s).
    :param chain_number_density: chains per m³ (ν).
    :param temperature_k: temperature (K).
    :param modes_reported: leading relaxation modes echoed in the report.
    :param time_grid_s: decade bounds of the G(t) grid.
    :param time_points: samples of the G(t) grid.
    :param angular_freq_points: samples of the G'(ω)/G''(ω) log grid.
    :returns: {status, tau1, tauModes, G0, modulus:{timeS, storageG, lossG}, definitions}
    """
    if beads_per_chain < 2 or kuhn_length_nm <= 0.0 or friction_per_bead <= 0.0:
        raise ValueError("beads_per_chain >= 2, kuhn_length_nm > 0, friction_per_bead > 0 required")
    if chain_number_density <= 0.0 or temperature_k <= 0.0:
        raise ValueError("chain_number_density and temperature_k must be positive")
    thermal = BOLTZMANN_J_PER_K * temperature_k
    b_m = kuhn_length_nm * 1e-9
    tau1 = friction_per_bead * b_m**2 * beads_per_chain**2 / (3.0 * np.pi**2 * thermal)
    mode_index = np.arange(1, 201)
    tau_modes = tau1 / mode_index**2

    times = np.logspace(np.log10(time_grid_s[0]), np.log10(time_grid_s[1]), max(time_points, 2))
    g_zero = chain_number_density * thermal
    # G(t) = (νkBT/N) Σ_p exp(−p²t/τ₁) over the resolved mode set.
    decay = np.exp(-np.outer(times, tau_modes))
    g_t = (g_zero / beads_per_chain) * decay.sum(axis=1)

    freqs = np.logspace(-3, 6, max(angular_freq_points, 2))
    reduced = np.outer(freqs, tau_modes)
    g_prime = (g_zero / beads_per_chain) * ((reduced**2) / (1.0 + reduced**2)).sum(axis=1)
    g_double = (g_zero / beads_per_chain) * (reduced / (1.0 + reduced**2)).sum(axis=1)

    return {
        "status": "OK",
        "tau1S": tau1,
        "tauModesS": [float(t) for t in tau_modes[:modes_reported]],
        "G0Pa": g_zero,
        "modulus": {
            "timeS": [float(t) for t in times],
            "gPa": [float(v) for v in g_t],
            "angularFreqRadS": [float(w) for w in freqs],
            "storagePa": [float(v) for v in g_prime],
            "lossPa": [float(v) for v in g_double],
        },
        "definitions": {
            "tau1S": "longest Rouse time τ₁ = ζb²N²/(3π²kBT) (s)",
            "G0Pa": "Rouse modulus G(0) = νkBT (Pa)",
            "tauModesS": "mode times τp = τ₁/p² (s)",
        },
    }


def shift_factors(
    model: Literal["wlf", "vft"],
    reference_temperature_k: float,
    temperatures_k: FloatArray | list[float],
    *,
    c1: float = WLF_UNIVERSAL_C1,
    c2_k: float = WLF_UNIVERSAL_C2_K,
    vft_c: float | None = None,
    vft_t_inf_k: float | None = None,
) -> dict[str, object]:
    """Horizontal time-temperature shift factors log₁₀ a_T relative to T₀.

    :param model: 'wlf' (Williams–Landel–Ferry) or 'vft' (Vogel–Fulcher–Tammann).
    :param reference_temperature_k: reference temperature T₀ (K, usually Tg).
    :param temperatures_k: temperatures at which to report a_T.
    :param c1: WLF constant at T₀ (default universal 17.44).
    :param c2_k: WLF constant at T₀ (default universal 51.6 K).
    :param vft_c: VFT prefactor C (default 2.303·C₁·C₂ for WLF equivalence).
    :param vft_t_inf_k: Vogel temperature T∞ (default T₀ − C₂).
    :returns: {status, model, referenceK, shift:{temperatureK, log10aT, aT}, definitions}
    """
    temps = np.asarray(temperatures_k, dtype=np.float64)
    if reference_temperature_k <= 0.0 or temps.size == 0 or np.any(temps <= 0.0):
        raise ValueError("temperatures must be positive and non-empty")
    if model == "wlf":
        delta = temps - reference_temperature_k
        log_shift = -c1 * delta / (c2_k + delta)
    elif model == "vft":
        t_inf = vft_t_inf_k if vft_t_inf_k is not None else reference_temperature_k - c2_k
        constant = vft_c if vft_c is not None else 2.302585 * c1 * c2_k
        if np.any(temps <= t_inf):
            raise ValueError("VFT needs temperatures above T∞")
        log_shift = constant / (temps - t_inf) - constant / (reference_temperature_k - t_inf)
    else:
        raise ValueError("model must be 'wlf' or 'vft'")
    return {
        "status": "OK",
        "model": model,
        "referenceK": reference_temperature_k,
        "shift": {
            "temperatureK": [float(t) for t in temps],
            "log10aT": [float(v) for v in log_shift],
            "aT": [float(10.0**v) for v in log_shift],
        },
        "definitions": {
            "aT": "horizontal shift factor; time scales as t(T) = a_T · t(T₀)",
            "log10aT": "decadic logarithm of a_T",
        },
    }
