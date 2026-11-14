# AI Economics methodology (v0.3)

This project is an **educational, auditable scenario calculator**, not a measure of any model provider's actual margins.

## The three distinct units

1. **Model call**: one inference execution; input can include system messages, chat history, file excerpts, tool results, and prompt instructions. A visible human message can trigger multiple model calls.
2. **Completed task**: a request or goal containing one or more human turns and model calls, and perhaps tool executions. Our per-task output includes all hypothetical calls, not just the last visible answer.
3. **Population-month**: the number of completed tasks in three disjoint segments (paid consumer, free consumer, and business API) multiplied by the corresponding per-task economics. Population counts are **illustrative inputs** until independent evidence supports them.

Three sample prompts (everyday question, brainstorming, coding/deployment) are in [research/workloads.json](../research/workloads.json). These are **representative illustrations** in the everyday sense, not statistically estimated means or measurements. In particular, a software agent task might require 1, 10, 100, or far more model calls; the default 60 calls is an intentionally adjustable scenario.

The fourth "My own question" mode estimates visible token counts locally using about one token per four English characters plus an explicit unobserved-context allowance. This is not the exact tokenizer and may be inaccurate for code, numbers, non-English text, or unseen system prompts. Pasting a prior response and entering provider-reported usage counts manually are preferable to heuristics.

## Per-task math

Definitions:
- C: model calls / task
- I: average input tokens / model call, including context
- O: average visible output tokens / model call
- f: assumed fraction of input tokens served from cache
- m: output billing multiplier (can represent hidden reasoning or other additional output-billed tokens)
- R: completed tasks per month

Total input = C × I; cached input = C × I × f; billable output = C × O × m.

**Retail API equivalent** = (uncached input × published input rate + cached input × published cached-input rate + billable output × published output rate) / 1,000,000.

A particular API's token billing categories may differ; fees for searches, media, context windows, tool invocations and other products are not modeled unless explicitly included. The API comparator is *not* guaranteed to equal the underlying model behind the consumer product.

**Output-equivalent compute** = (uncached input × hypothetical input-compute weight) + (cached input × hypothetical cached-input-compute weight) + billed output.

The default GPU proxy is an eight-H100 system, with assumed **2,000 output-equivalent tokens/s** and **60%** effective annual utilization. This is *not a verified throughput benchmark for the selected proprietary model*. System annual utilized capacity = throughput × 3,600 × 8,760 × utilization.

**Cloud rented mode** allocates a year of published eight-H100 instance rental cost over that utilized capacity. AWS rental prices already include vendor facilities, electricity, hardware depreciation and margin. Do not add a second PUE/power/hardware cost to rented GPU charges.

**Owned mode** instead allocates capex depreciation + (average system power kW × facility PUE × electricity rate × 8,760 h) + equipment maintenance. We do not claim this is an actual provider equipment bill.

**Operations/admin** allocates (FTEs × fully loaded annual employee cost × (1 + corporate allocation fraction)) across the hypothetical number of eight-GPU systems in a modeled fleet, then charges an allocated fraction by output-equivalent tokens. This covers a limited activity-based overhead proxy; it does NOT capture a fully audited company income statement.

Serving subtotal = GPU/facilities allocation + modeled operations/admin allocation.

External tools: the coding example includes tool execution *counts* but no assumed execution dollar charge. The subtotal excludes those tool costs unless a visitor enters an explicit dollar amount. Unknown does not equal zero. Training/R&D, financing, taxes, hardware R&D, other products, advertising sales, payment fees, sales/marketing and company-wide admin are also generally excluded.

Per-task share of a consumer's subscription = monthly plan fee / tasks per month, **not** a per-task charge. A user may pay the same monthly fee whether they complete 10 or 1,000 tasks.

"Subscription revenue less serving cost" and "API revenue less serving cost" are **modeled contributions**, not profit or measured subsidy.

## Sensitivity bands

The "optimistic" and "conservative" scenarios vary hypothetical throughput, fleet utilization, staffing and fleet size. These are sensitivity tests, **not statistical confidence intervals** and cannot measure certainty in model routing, proprietary inference, or infrastructure. The same hardware proxy is used for all three providers, so differences do not imply hardware efficiency advantages.

## Company-scale population scenario

The macro view uses the *same* per-task token and cost model across three separate customer categories:

- Paid tasks/month = hypothetical paying subscribers × completed tasks per paid subscriber per month
- Free tasks/month = hypothetical active free users × completed tasks per free user per month
- API tasks/month = separately entered completed API workloads

No user is counted twice within this simplified model; in reality some people may be customers in several segments. Mixed/enterprise subscriptions, bundles, promotions and model tiers are not fully represented.

**Modeled gross revenue / month**:
- paid subscribers × selected consumer list price
- plus active free users × explicitly assumed advertising revenue per user (default $0 means not *estimated*)
- plus completed API tasks × API retail equivalent per task × assumed realization factor (captures discounts/partner economics only as a user scenario)

**Modeled serving expense / month** = paid consumer task count × paid per-task serving subtotal + free task count × free per-task serving subtotal + API task count × API per-task serving subtotal.

All audience counts and workloads are user-adjustable **fictional defaults**, not observed or asserted subscriber totals. An optional annual additional-expense input can layer on other business costs, but must not be confused with known disclosed spending; it could double-count categories if misused.

**Estimated eight-GPU systems required** = total monthly output-equivalent tokens / (one system's annual utilized output-equivalent capacity / 12). This is an average-capacity planning figure and ignores latency, peak concurrency, redundancy and regional constraints.

**Display periods** are run-rate normalizations of the hypothetical month: day = month × 12 / 365.25; year = month × 12. They are not historical revenue or cash flow. A static scenario is not a year of actual changing business demand.

## Reported financial disclosures — separate ledger, not added to model

The research page includes separate public financial context:
- **Anthropic**: SEC S-1/A filing, nine months ended September 30, 2026, reported approximately $33.2B in combined consumption/subscription revenue and $18.808B in **all compute and infrastructure**, including both customer-serving and model development. That total does not equal the serving expense in our scenario. Source: https://www.sec.gov/Archives/edgar/data/2130357/000162828026068676/anthropicpbc-sx1ax1.htm
- **OpenAI**: Reuters October 8, 2026 reporting suggests near $50B annualized revenue for September 2026, versus a prior near $70B metric with different partner-scope treatment. Neither is audited historical annual revenue. Source: https://www.investing.com/news/stock-market-news/openais-annualized-revenue-20-billion-less-than-previously-signaled-ft-reports-4939854
- **Alphabet**: its September 30, 2026 quarterly filing reports $30.709B Google Cloud revenue in Q3 2026. This includes a large non-Gemini, non-generative-AI portfolio. It cannot be used as Gemini product revenue. Source: https://www.sec.gov/Archives/edgar/data/1652044/000165204426000084/goog-20260930.htm

Financial data are **scope-tagged** in [research/macro.json](../research/macro.json). They are *not* inserted into the population scenario calculations, nor annualized blindly across mismatched time periods.

## Source collection and release controls

purgatory01 runs a sequential, low-resource source **change monitor** via systemd. It fetches public URLs, stores SHA-256 digests and status in a local SQLite database, and generates static JSON. A page hash change does not prove a relevant numeric price change, so no rate is updated without reviewing source evidence. Prices and assumptions remain in version-controlled JSON catalog files.

This is not yet a fully autonomous research ingestion engine. Validated EIA/BLS/SEC structured parsers, MLPerf benchmark normalization, source-effective-date history and provider-specific model proxies should follow.

The generated static site executes interactive calculations in the visitor's browser; purgatory01 does **not** handle page traffic or process a user's pasted text. Export to the private Vite website is separate and **not deployed** as part of this prototype.

## Criteria before public launch

1. Obtain model-specific throughput/latency benchmarks or publish conservative, clearly labeled proxy model classes with uncertainty ranges.
2. Expand beyond token-only costs: tools, multimodal, networking, staging/deployment compute and persistent storage.
3. Confirm retail model pricing and effective dates with source-specific validation, not merely webpage hashing.
4. Add data extraction workflows to propose reviewed numerical updates and preserve historical pricing snapshots.
5. Compare with any reported company-scale cost and revenue *only after* aligning scopes and periods; do not treat CAPEX commitments as actual cash operating expense.
6. Run browser-level accessibility/responsiveness testing and benchmark parity checks on purgatory01 before publishing to Vercel.
