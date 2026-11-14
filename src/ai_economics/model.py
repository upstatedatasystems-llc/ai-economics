"""Pure, dependency-free economic formulas. Nothing here estimates hidden provider telemetry."""
from __future__ import annotations

from copy import deepcopy


def _safe_number(value: object, name: str, low: float = 0) -> float:
    if isinstance(value, bool) or not isinstance(value, (float, int)):
        raise ValueError(name + " must be numeric")
    f = float(value)
    if not low <= f <= 1e12:
        raise ValueError(name + " out of range")
    return f


def values(catalog: dict, overrides: dict | None = None) -> dict:
    result = {key: spec["value"] for key, spec in catalog["assumptions"].items()}
    for key, value in (overrides or {}).items():
        if key not in catalog["assumptions"]:
            raise ValueError("Unknown assumption " + key)
        rule = catalog["assumptions"][key]
        n = _safe_number(value, key)
        if not rule["min"] <= n <= rule["max"]:
            raise ValueError(key + " outside disclosed scenario range")
        result[key] = n
    return result


def estimate(catalog: dict, provider_id: str, *,
             responses: int = 1000, input_tokens: int = 2000, output_tokens: int = 1000,
             cache_fraction: float = 0.0, thinking_multiplier: float = 1.0,
             subscription: bool = True, ownership: str = "cloud",
             overrides: dict | None = None) -> dict:
    if ownership not in {"cloud", "owned"}:
        raise ValueError("ownership must be cloud or owned")
    if not isinstance(responses, int) or not 0 <= responses <= 1_000_000:
        raise ValueError("Invalid responses")
    if not isinstance(input_tokens, int) or not 0 <= input_tokens <= 1_000_000:
        raise ValueError("Invalid input_tokens")
    if not isinstance(output_tokens, int) or not 0 <= output_tokens <= 1_000_000:
        raise ValueError("Invalid output_tokens")
    cache_fraction = _safe_number(cache_fraction, "cache_fraction")
    if cache_fraction > 1:
        raise ValueError("cache_fraction must be <= 1")
    thinking_multiplier = _safe_number(thinking_multiplier, "thinking_multiplier", 1.0)
    if thinking_multiplier > 10:
        raise ValueError("thinking_multiplier must be <= 10")
    provider = next((p for p in catalog["providers"] if p["id"] == provider_id), None)
    if provider is None:
        raise ValueError("Unknown provider")
    a = values(catalog, overrides)
    refs = {key: val["value"] for key, val in catalog["references"].items()}
    uncached_input = input_tokens * (1 - cache_fraction)
    cached_input = input_tokens * cache_fraction
    # Additional hidden reasoning tokens are billed as output tokens for this scenario.
    effective_output = output_tokens * thinking_multiplier
    api = responses * (
        uncached_input * provider["input_usd_m"]
        + cached_input * provider["cached_input_usd_m"]
        + effective_output * provider["output_usd_m"]
    ) / 1_000_000
    consumer = provider["subscription_usd_month"] if subscription else 0.0
    # Cloud price already includes power, facility, depreciation and cloud operator margin.
    annual_cloud = refs["h100_p5_8gpu_usd_hour"] * 24 * 365
    annual_owned = (
        a["owned_hardware_usd"] / a["depreciation_years"]
        + a["server_avg_power_kw"] * refs["pue"] * refs["electricity_usd_kwh"] * 8760
        + a["owned_hardware_usd"] * a["facility_maintenance_fraction"]
    )
    annual_node = annual_cloud if ownership == "cloud" else annual_owned
    # Fleet-shared operational staff is allocated over utilized annual token capacity.
    staff_annual = a["operations_fte"] * a["fully_loaded_salary_usd"] * (1 + a["corporate_overhead_fraction"])
    operation_per_node = staff_annual / a["fleet_nodes"]
    full_node = annual_node + operation_per_node
    capacity = a["gpu_effective_tokens_s"] * 3600 * 8760 * a["utilization"]
    weighted_monthly_tokens = responses * (
        uncached_input * a["input_compute_weight"]
        + cached_input * a["cached_input_compute_weight"]
        + effective_output
    )
    direct = weighted_monthly_tokens / capacity * annual_node
    overhead = weighted_monthly_tokens / capacity * operation_per_node
    fully_loaded = direct + overhead
    return {
        "consumer_payment_usd": round(consumer, 8),
        "gross_subscription_revenue_usd": round(consumer, 8),
        "api_retail_equivalent_usd": round(api, 8),
        "direct_infrastructure_usd": round(direct, 8),
        "allocated_operations_and_admin_usd": round(overhead, 8),
        "total_modeled_serving_usd": round(fully_loaded, 8),
        "gross_revenue_minus_serving_usd": round(consumer - fully_loaded, 8),
        "api_revenue_minus_serving_usd": round(api - fully_loaded, 8),
        "output_equivalent_tokens": round(weighted_monthly_tokens, 2),
        "scenario": {"ownership": ownership, "cache_fraction": cache_fraction,
                     "thinking_multiplier": thinking_multiplier, "subscription": subscription,
                     "assumptions": deepcopy(a)},
        "disclaimer": "Research scenario, not provider costs, margins, or measured subsidy."
    }
