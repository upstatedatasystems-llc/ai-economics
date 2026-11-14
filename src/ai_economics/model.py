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
        "consumer_payment_usd": round(consumer, 12),
        "gross_subscription_revenue_usd": round(consumer, 12),
        "api_retail_equivalent_usd": round(api, 12),
        "direct_infrastructure_usd": round(direct, 12),
        "allocated_operations_and_admin_usd": round(overhead, 12),
        "total_modeled_serving_usd": round(fully_loaded, 12),
        "gross_revenue_minus_serving_usd": round(consumer - fully_loaded, 12),
        "api_revenue_minus_serving_usd": round(api - fully_loaded, 12),
        "output_equivalent_tokens": round(weighted_monthly_tokens, 2),
        "scenario": {"ownership": ownership, "cache_fraction": cache_fraction,
                     "thinking_multiplier": thinking_multiplier, "subscription": subscription,
                     "assumptions": deepcopy(a)},
        "disclaimer": "Research scenario, not provider costs, margins, or measured subsidy."
    }


def estimate_workload(catalog: dict, provider_id: str, workload: dict, *,
                      tasks_per_month: int | None = None,
                      subscription: bool = True, ownership: str = "cloud",
                      overrides: dict | None = None,
                      external_tool_usd_per_task: float | None = None) -> dict:
    """Price one completed task and repeated monthly tasks without confusing model calls and user turns.

    External tools remain UNPRICED unless a caller supplies an explicit dollar estimate.
    Consumer per-task spending is an allocation of a fixed subscription, not marginal billing.
    """
    required = ("user_turns", "model_calls", "input_tokens_per_call",
                "visible_output_tokens_per_call", "cached_input_fraction",
                "billed_output_multiplier", "tool_executions")
    if any(key not in workload for key in required):
        raise ValueError("workload missing a required field")
    for field in ("user_turns", "model_calls", "input_tokens_per_call",
                  "visible_output_tokens_per_call", "tool_executions"):
        value = workload[field]
        if isinstance(value, bool) or not isinstance(value, int) or not 0 <= value <= 1000000:
            raise ValueError("invalid workload count: " + field)
    calls = workload["model_calls"]
    if calls < 1 or workload["user_turns"] < 1:
        raise ValueError("workload requires turns and calls")
    repeats = workload.get("tasks_per_month", 1) if tasks_per_month is None else tasks_per_month
    if isinstance(repeats, bool) or not isinstance(repeats, int) or not 1 <= repeats <= 10000:
        raise ValueError("tasks_per_month must be 1..10000")
    cache = _safe_number(workload["cached_input_fraction"], "cached_input_fraction")
    if cache > 1:
        raise ValueError("cached_input_fraction cannot exceed one")
    thinking = _safe_number(workload["billed_output_multiplier"], "billed_output_multiplier", 1)
    if not 1 <= thinking <= 10:
        raise ValueError("invalid billed output multiplier")
    if external_tool_usd_per_task is not None:
        external_tool_usd_per_task = _safe_number(external_tool_usd_per_task, "external_tool_usd_per_task")
    def run(total_calls, subscribed):
        return estimate(
            catalog, provider_id, responses=total_calls,
            input_tokens=workload["input_tokens_per_call"],
            output_tokens=workload["visible_output_tokens_per_call"],
            cache_fraction=cache, thinking_multiplier=thinking,
            subscription=subscribed, ownership=ownership, overrides=overrides
        )
    one = run(calls, False)
    month = run(calls * repeats, subscription)
    billable_output = round(calls * workload["visible_output_tokens_per_call"] * thinking)
    cached_input = round(calls * workload["input_tokens_per_call"] * cache)
    volume = {
        "user_turns": workload["user_turns"],
        "model_calls": calls,
        "tool_executions_unpriced": workload["tool_executions"],
        "input_tokens_estimated": calls * workload["input_tokens_per_call"],
        "cached_input_tokens_estimated": cached_input,
        "visible_output_tokens_estimated": calls * workload["visible_output_tokens_per_call"],
        "billed_output_tokens_estimated": billable_output,
        "extra_hidden_output_tokens_estimated": billable_output - calls * workload["visible_output_tokens_per_call"],
        "tasks_per_month": repeats,
        "monthly_model_calls": calls * repeats
    }
    model_cost = one["total_modeled_serving_usd"]
    known_tools = external_tool_usd_per_task is not None
    total_task = model_cost + (external_tool_usd_per_task if known_tools else 0)
    monthly_model_cost = month["total_modeled_serving_usd"]
    monthly_cost = monthly_model_cost + (external_tool_usd_per_task * repeats if known_tools else 0)
    return {
        "volume": volume,
        "per_task": {
            "subscription_allocation_usd": round(month["gross_subscription_revenue_usd"] / repeats, 12),
            "api_retail_equivalent_usd": one["api_retail_equivalent_usd"],
            "inference_infrastructure_usd": one["direct_infrastructure_usd"],
            "allocated_operations_usd": one["allocated_operations_and_admin_usd"],
            "modeled_inference_subtotal_usd": round(model_cost, 12),
            "external_tool_cost_usd": external_tool_usd_per_task,
            "total_if_external_cost_specified_usd": round(total_task, 12) if known_tools else None,
            "completeness": "tool_cost_user_supplied" if known_tools else "model_only_unpriced_tools"
        },
        "per_month": {
            "subscription_gross_usd": month["gross_subscription_revenue_usd"],
            "api_retail_equivalent_usd": month["api_retail_equivalent_usd"],
            "modeled_inference_subtotal_usd": round(monthly_model_cost, 12),
            "total_if_external_cost_specified_usd": round(monthly_cost, 12) if known_tools else None,
            "subscription_minus_modeled_inference_usd": round(
                month["gross_subscription_revenue_usd"] - monthly_model_cost, 12)
        },
        "caveat": "Model-only serving subtotal; subscription share is accounting allocation, not price per request. No proprietary provider costs observed."
    }


def estimate_macro(catalog: dict, provider_id: str, workload_profiles: list[dict],
                   parameters: dict, *, ownership: str = "cloud",
                   overrides: dict | None = None) -> dict:
    """Annualized illustrative company-scale inference economics, NEVER actual provider filings.

    Paid/free/API segments are mutually exclusive modeled demand. Reported financial
    disclosures must be presented independently and not combined with these results.
    """
    provider = next((p for p in catalog["providers"] if p["id"] == provider_id), None)
    if not provider:
        raise ValueError("unknown provider")
    profiles = {p["id"]: p for p in workload_profiles}
    if len(profiles) != len(workload_profiles):
        raise ValueError("duplicate workload id")
    counts = ("paid_users", "free_users", "paid_tasks_per_user",
              "free_tasks_per_user", "api_tasks_per_month")
    for name in counts:
        if name not in parameters or isinstance(parameters[name], bool):
            raise ValueError("missing or invalid macro count: " + name)
        if not isinstance(parameters[name], (int, float)):
            raise ValueError("invalid macro count: " + name)
        if not 0 <= parameters[name] <= 1_000_000_000:
            raise ValueError("macro count out of range: " + name)
    paid_count = parameters["paid_users"] * parameters["paid_tasks_per_user"]
    free_count = parameters["free_users"] * parameters["free_tasks_per_user"]
    api_count = parameters["api_tasks_per_month"]
    def unit(profile_key):
        key = parameters[profile_key]
        if key not in profiles:
            raise ValueError("unknown macro profile: " + key)
        return estimate_workload(
            catalog, provider_id, profiles[key], tasks_per_month=1,
            subscription=False, ownership=ownership, overrides=overrides)
    paid_unit, free_unit, api_unit = (
        unit("paid_profile"), unit("free_profile"), unit("api_profile"))
    ad_per_user = _safe_number(parameters.get("ad_usd_per_free_user_month", 0), "ad_per_user")
    realization = _safe_number(parameters.get("api_realization", 1), "api_realization")
    if realization > 1:
        raise ValueError("API realization > 1")
    other_annual = _safe_number(parameters.get("additional_annual_expense_usd", 0),
                                "additional_annual_expense_usd")
    subscriptions = parameters["paid_users"] * provider["subscription_usd_month"]
    advertising = parameters["free_users"] * ad_per_user
    api_revenue = api_count * api_unit["per_task"]["api_retail_equivalent_usd"] * realization
    paid_cost = paid_count * paid_unit["per_task"]["modeled_inference_subtotal_usd"]
    free_cost = free_count * free_unit["per_task"]["modeled_inference_subtotal_usd"]
    api_cost = api_count * api_unit["per_task"]["modeled_inference_subtotal_usd"]
    serving = paid_cost + free_cost + api_cost
    gross = subscriptions + advertising + api_revenue
    other_month = other_annual / 12
    def period(scale):
        return {key: round(value * scale, 2) for key, value in {
            "subscription_revenue_usd": subscriptions,
            "advertising_revenue_assumed_usd": advertising,
            "api_revenue_usd": api_revenue,
            "gross_revenue_usd": gross,
            "consumer_serving_usd": paid_cost + free_cost,
            "api_serving_usd": api_cost,
            "modeled_serving_usd": serving,
            "additional_expense_assumed_usd": other_month,
            "modeled_total_expense_usd": serving + other_month,
            "revenue_less_modeled_expense_usd": gross - serving - other_month
        }.items()}
    return {
        "task_counts_monthly": {
            "paid": paid_count, "free": free_count, "api": api_count},
        "model_calls_monthly": (
            paid_count * paid_unit["volume"]["model_calls"]
            + free_count * free_unit["volume"]["model_calls"]
            + api_count * api_unit["volume"]["model_calls"]),
        "day": period(12 / 365.25),
        "month": period(1),
        "year": period(12),
        "is_actual_provider_data": False,
        "description": "Illustrative serving costs and population scenarios, not a company P&L."
    }
