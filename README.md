# AI Economics

Research-based public calculator comparing AI **consumer subscription payments**, **equivalent API retail charges**, **modeled inference infrastructure**, and **allocated operations / administration**, at both a **completed-task** scale and an **illustrative company-scale** daily/monthly/yearly scale.

Published by Upstate Data Systems LLC. Designed to run source monitoring and static research exports on **purgatory01** (lightweight Oracle Cloud AMD64 VM), then display a self-contained calculator on upstatedatasystems.com/ai-economics.

**Status: v0.6 initial public release at https://upstatedatasystems.com/ai-economics.** The company website hosts a reviewed static snapshot pinned to source commit `3a1a64e569522d2116dec1aa93430ce8d154c37a` from this repository. Deployment uses the private Vite/Vercel website repo; purgatory01 is not exposed or automatically connected to the public website. No AI models run on visitors' behalf, and no paid AI APIs or GPUs are required.

## Public website release and data freshness

The company website now bundles the independent static calculator under `public/ai-economics/`, with a homepage product card, navigation, source disclosures and a sitemap URL. Deployment of website commit `9f3d57befaea489c154b6cf57d97a8dfd6108218` passed website CI and received a successful Vercel deployment status on November 14, 2026.

The live `data/research.json` is an intentionally **pinned, reviewed research snapshot** (source commit `3a1a64e569522d2116dec1aa93430ce8d154c37a`). The public `data/health.json` is a static metadata report, not a live research-monitor feed. Prices, model names, throughput and population assumptions require further verification and periodic review; users should not mistake hypothetical macro numbers for real provider income statements.

Future app changes in this public source repository must be explicitly synchronized into `upstatedatasystems-llc/upstate-data-systems-website` and redeployed. An automated, review-gated sync is a separate backlog item. The AI Economics source monitor and daily systemd service do not currently publish to Vercel.

## What's new in v0.6 — token scale, help and charts

- **Charcoal app shell.** The header, left navigation, center workspace, and right live-summary panel now use subdued dark-gray surfaces; green is used sparingly for branding and selected states.
- **Token quantities you can picture.** A selector in the live summary converts token values to approximate English words, printed pages (250 words), 1,000-word articles, novels (80,000 words), copies of Homer's Odyssey (~120,000 words), or copies of War and Peace (~566,513 English words for one translation). The selected unit appears alongside per-call input/output, task input/cached/output/hidden counts, the right summary, and monthly task text volume. The rough conversion of 1 token ≈ 0.75 English words is not a model-specific tokenizer. English word count of The Odyssey varies by translation; the 120k reference describes the original Greek.
- **Metric information icons.** Adjustable fields and major result metrics now have expandable explanations next to their labels instead of dense always-visible descriptions. Popovers work by click or keyboard and close with Escape.
- **Personal scale graph.** Three horizontal bars compare your fixed monthly subscriptions or API bill, the same work at published API retail rates, and modeled inference/operations expense including any entered outside tools.
- **Company-scale graph.** Two bars on a shared linear dollar scale compare hypothetical revenue (subscription, assumed ads, realized API billing) with included expense (infrastructure, supporting operations, optional additional expense). Both are stacked into their own category breakdown, with a legend and a coverage explanation. These are never totaled together.
- **Small-server compatibility.** New presentation modules are plain JavaScript with no dependencies. The Python export and test suite include them; only the selected step scrolls within the viewport.

Comparative bars are linear, not logarithmic. Tiny nonzero bars can be given a minimum visible 2-pixel width; use the displayed dollar labels for exact quantities. All monetary and company-population scenarios remain illustrative, not measured provider expenses.

Reference sources: OpenAI token estimate https://help.openai.com/en/articles/4936856-understanding-and-counting-tokens ; Penguin on The Odyssey https://www.penguin.co.uk/discover/articles/the-odyssey-homer-guide-summary-characters-best-version-translation ; word count for one English War and Peace translation https://vocabularybuilding.org/words-in/war-and-peace/ .

### Retest the existing purgatory01 preview

    cd ~/ai-economics
    git pull --ff-only
    PYTHONPATH=src python3 -m unittest discover -s tests -v
    PYTHONPATH=src python3 -m ai_economics serve --port 8765

Reconnect your existing private Windows SSH tunnel and open http://127.0.0.1:8765. Stop the preview using Ctrl+C. Server diagnostics:

    PYTHONPATH=src python3 -m ai_economics diagnostics --output ~/ai-economics-v06-diagnostics.tar.gz

The top-bar Diagnostics action downloads browser-side numeric inputs and JavaScript errors without including pasted prompt/answer text. The initial static website release was approved and deployed November 14, 2026; changes made in this source repo do not automatically update the live site.

## v0.5 — subscription and API access; full-scale cost scenarios

**Six guided steps:** choose a task; choose billing access (one or more consumer plans versus API); size all model calls and tokens; estimate task cost; compare monthly/company-wide economics; inspect sources and collection status.

**Branding and design:** the actual Upstate Data Systems website wordmark, icon and favicon are now bundled in this public repository. The banner and side panels remain green, while the central work area uses charcoal and slate gray.

The subscription example starts with ChatGPT Plus and Google AI Pro selected at $20 and $19.99/month. The illustrated monthly workload is divided 50/50, **not billed twice**. Change each plan and its work-share weight. Alternatively, select API mode and choose a provider: its public API retail rate is treated as usage-based billed expense instead of a subscription.

The dashboard answers two **different** comparisons: (1) the subscription price versus what that work would cost at *published API retail rates* (an alternative purchase-price benchmark, not a guaranteed plan allowance or real subsidy), and (2) the modeled inference/operations cost of serving the tasks (not reported provider expense). Some plans bundle other products or limited API credits; these are not automatically valued or deducted.

The company-scale editor now offers editable **users, task frequencies and task shapes at every consumer tier**, with separate API customer count, task rate, public-price realization, advertising, and additional annual expenses. Initial distributions are explicitly **fictional demonstrations**, not estimates of any real company's audience. It reports subscription/API revenue versus GPU infrastructure, supporting operations, and optional other expenses for day/month/year.

Two selectable cost bases are alternatives, not additive: **usage-allocated** per-token capacity share, and **provisioned fleet** of whole eight-GPU-equivalent systems plus a configurable spare-capacity fraction. The latter is closer to a theoretical reserved-capacity budget, not an actual vendor invoice. Owned-system depreciation is an accounting allocation. Unknown corporate functions, training, R&D, model differences, peak demand and tool charges remain outside the default estimate.

**v0.4 diagnostics correction:** Google plan/API monitoring returned zero verifiable price-bearing page text. Both are now marked for manual review instead of repeated scheduled extraction.

### Retest on purgatory01

    cd ~/ai-economics
    git pull --ff-only
    PYTHONPATH=src python3 -m unittest discover -s tests -v
    PYTHONPATH=src python3 -m ai_economics refresh --force
    PYTHONPATH=src python3 -m ai_economics serve --port 8765

Use the same Windows SSH tunnel and open http://127.0.0.1:8765. The app binds only to loopback. Stop the preview with Ctrl+C.

For server diagnostics run:

    PYTHONPATH=src python3 -m ai_economics diagnostics --output ~/ai-economics-v05-diagnostics.tar.gz

The top-bar Diagnostics action downloads browser diagnostics without pasted prompt or answer contents. Review both artifacts before sharing.

## What's new in v0.4 — guided single-pane application

The old vertically scrolling dashboard has been replaced with a five-step, full-viewport estimator:

1. **Choose task** — question, brainstorming, agentic coding or your own prompt.
2. **Size the work** — total model calls, average input/output tokens, cached fraction and monthly repeat count.
3. **Estimate cost** — provider/API retail comparator, paid/free plan, owned/rented eight-GPU proxy, costs and sensitivity.
4. **Explore scale** — personal monthly usage or hypothetical company-scale day/month/year revenue-versus-serving scenarios.
5. **Inspect evidence** — research sources, separate financial disclosures and research-collector health.

The live per-task cost summary stays on screen while navigating. On narrow screens the app uses a compact summary and a horizontal step bar. Only the selected step has an internal scroll region; the entire page does not require long scrolling.

**Research collector corrections from the Nov 14 purgatory01 diagnostics:**

- Known automated-403 sources (OpenAI plan, BLS wage page, SEC developer page) are explicitly **manual** until official structured adapters are ready, instead of repeatedly failing the timer.
- Other structured/unsupported content (EIA generic landing page, MLPerf repo page, Uptime PDF) also remains manual rather than generating misleading page-hash alerts.
- Monitored HTML is reduced to normalized, price-bearing evidence. Dynamic timestamps/scripts and identical price text do **not** cause an alert; changed price evidence gets a **candidate_change** requiring review.
- Source-specific collection intervals are respected; \`collect --force\` and \`refresh --force\` override the schedule for testing.
- The legacy raw-byte-hash SQLite history is preserved, but new v2 monitor tables begin fresh rather than treating old false alerts as validated price differences.
- The numeric research catalog remains unchanged without a reviewed Git commit.
- Both server and browser can now produce privacy-conscious diagnostic archives/files.

### Upgrade the existing purgatory01 test checkout

If you previously cloned to \`~/ai-economics\`, reconnect over SSH and run:

    cd ~/ai-economics
    git pull --ff-only
    PYTHONPATH=src python3 -m unittest discover -s tests -v
    PYTHONPATH=src python3 -m ai_economics build
    PYTHONPATH=src python3 -m ai_economics serve --port 8765

Reconnect your original SSH tunnel from Windows and load http://127.0.0.1:8765. The server binds only to loopback. No changes to the live site or public firewall are needed. Use Ctrl+C to stop the preview.

### Collector and diagnostics

After stopping the web preview (optional; collection can also run while the preview is running, but refresh the page to see its new status):

    cd ~/ai-economics
    PYTHONPATH=src python3 -m ai_economics refresh --force
    PYTHONPATH=src python3 -m ai_economics health
    PYTHONPATH=src python3 -m ai_economics diagnostics --output ~/ai-economics-v04-diagnostics.tar.gz

A manual source is intentionally not fetched. A source reporting **blocked** or **unverifiable** is not proof of a price change; only **candidate_change** means normalized price evidence changed, and still requires review. Temporary network failures remain **fetch_error** and cause the refresh command to exit with code 2.

The diagnostics archive includes test results, repo commit, asset checks, source status and last collection metadata, **not** SSH keys, secret environment variables, private prompts, or unrelated service data. Review it before sharing.

For browser-side problems, click **Diagnostics** in the application's top bar; it downloads \`ai-economics-browser-diagnostics.json\` with the active step, selected workload's numeric inputs, calculated costs, and caught JavaScript errors. It deliberately omits pasted questions and answers.

**CI-only browser tests** exercise the five-step app in desktop and mobile Chromium. Installing this test suite on the tiny OCI host is unnecessary; its Python-only runtime is unchanged.

## What's new in v0.3

- Clickable, side-by-side **everyday question**, **multi-turn brainstorming session** and **agentic coding + staging deployment** examples. Each shows model-call counts, estimated input/cached/output tokens, output-billing allowance, published API equivalent, and modeled serving cost.
- A **My own question** mode accepts pasted prompts and optional answers in the visitor's browser (not uploaded) and estimates their visible token counts. The heuristic is approximate and cannot know hidden provider context or reasoning.
- Optional per-task external-tool cost input: tool executions are displayed but **never silently assigned $0** when unpriced.
- A separate **company-scale scenario** for hypothetical paying customers, free users, API workloads, advertising and additional expenses. It displays normalized daily, monthly, and yearly expense/revenue and the implied eight-GPU capacity.
- **Reported financial context**, clearly separated from scenario mathematics: Anthropic's filing, an OpenAI reported run rate, and an Alphabet Google Cloud disclosure. Their periods and scopes are not interchangeable.
- Standalone audited methodology: [docs/METHODOLOGY.md](docs/METHODOLOGY.md). Source and population defaults: [research/workloads.json](research/workloads.json), [research/macro.json](research/macro.json).

**Important:** the sample audience sizes, task token counts, throughput assumptions and staffing ratios are illustrative—not measured provider usage or actual company cost/revenue. The macro screen cannot establish what these companies *really* spend without additional evidence. 


## Quick local preview

Requires Python 3.10+; no dependencies to install.

    git clone https://github.com/upstatedatasystems-llc/ai-economics.git
    cd ai-economics
    PYTHONPATH=src python3 -m ai_economics build
    PYTHONPATH=src python3 -m ai_economics serve --port 8765

Open http://127.0.0.1:8765 on that machine.

On Windows PowerShell:

    $env:PYTHONPATH = "src"
    python -m ai_economics serve --port 8765

Offline tests:

    PYTHONPATH=src python3 -m unittest discover -s tests -v

## Install and preview on purgatory01

Do not install without first checking available RAM, swap, disk, the existing launcher/Herald services and listening ports. The collector uses standard-library Python, SQLite and sequential HTTP fetches; it needs no Docker container or PostgreSQL.

SSH to the server as your regular account and run:

    free -h
    df -h /
    systemctl --failed
    git clone https://github.com/upstatedatasystems-llc/ai-economics.git "$HOME/ai-economics"
    cd "$HOME/ai-economics"
    PYTHONPATH=src python3 -m ai_economics build
    PYTHONPATH=src python3 -m unittest discover -s tests -v
    PYTHONPATH=src python3 -m ai_economics serve --port 8765

The preview is bound ONLY to 127.0.0.1. On your computer, open a second terminal:

    ssh -N -L 8765:127.0.0.1:8765 ubuntu@YOUR_PURGATORY01_PUBLIC_IP

Then open http://127.0.0.1:8765 in a local browser. No inbound firewall/OCI security-list changes are necessary.

If local port 8765 is in use, tunnel another local port, for example:

    ssh -N -L 8877:127.0.0.1:8765 ubuntu@YOUR_PURGATORY01_PUBLIC_IP

Then visit http://127.0.0.1:8877.

The server may require a different login username or your existing SSH host alias.

## Daily data collection (optional, after testing)

The repository provides an unprivileged, resource-capped systemd oneshot service and daily timer. Nothing is enabled until you deliberately install it.

After reviewing the local preview, install a separate production copy. The systemd setup will create dedicated writable state folders for the service account. From your SSH shell:

    sudo git clone https://github.com/upstatedatasystems-llc/ai-economics.git /opt/ai-economics
    cd /opt/ai-economics
    sudo bash scripts/prepare-purgatory01.sh
    sudo systemctl enable --now ai-economics-refresh.timer
    sudo systemctl start ai-economics-refresh.service
    sudo journalctl -u ai-economics-refresh.service -n 80 --no-pager
    PYTHONPATH=src python3 -m ai_economics health

The timer executes daily at approximately 04:15 UTC, with randomized delay. Each run respects each source's frequency and records normalized price-bearing evidence digests, timestamps and status in a local SQLite database. Manual sources are not repeatedly fetched. The job is capped at 160 MB RAM and 40% CPU and does not bind a network port. Failed fetches do not erase last-reviewed pricing.

Important: for phase one, this is an **automated change monitor**. Pricing facts are kept in version-controlled research/catalog.json and are not silently overwritten when a supplier edits a page. Review updated sources, update reviewed facts, and optionally acknowledge a checked source with:

    PYTHONPATH=src python3 -m ai_economics ack-source openai_api

Acknowledgment only marks a digest as checked. It does NOT automatically alter pricing.

Adding structured EIA, BLS, SEC and benchmark adapters with verified numeric extraction is the next milestone; the monitoring is already ready for scheduled operation.

## Export to existing Vite website

The existing Upstate Data Systems website is a Vite project. From this project:

    PYTHONPATH=src python3 -m ai_economics export --target /tmp/ai-econ-export

Copy the resulting ai-economics folder to the website repository's public/ai-economics folder. Its Vite build will copy the content into the final site at /ai-economics/. The front end fetches versioned static JSON and calculates locally; it never queries purgatory01.

**Initial production deployment approved November 14, 2026.** Subsequent source code or numerical price changes still require reviewed sync into the website repo. Automated publishing is not yet configured; if introduced, use narrow, reviewed credentials rather than a public-site API secret.

## Research methodology

- Reviewed initial consumer and API prices and source references are in research/catalog.json, as of 2026-11-13.
- Comparison models: GPT-6.1 Sol, Claude Sonnet 4.6, and Gemini 2.5 Flash. These are selected public retail-rate comparators, NOT assertions that consumer chats always use these models.
- Inputs: monthly responses, input tokens, output tokens, cached input fraction and additional output-billed tokens multiplier.
- API scenario: charge published input, cached input and billed output tokens at listed API rates.
- Cloud scenario: eight-H100 published cloud rental, effective token throughput and utilization; cloud price ALREADY incorporates the cloud operator's equipment and facilities.
- Owned scenario: separately calculate server capex depreciation, assumed average power, PUE, electricity and maintenance. Do not add cloud rental to owned cost.
- Overhead: hypothetical team FTEs times fully loaded pay and corporate administration allocation, spread across the modeled active fleet. Not known real provider staffing.
- Low and high results alter throughput, utilization, personnel and fleet scale. These are **sensitivity scenarios**, not statistically derived confidence intervals.
- No research/training expense or ad revenue is included. Gross consumer payment is not provider net revenue after fees. API equivalent is retail value, not a realized sale.
- There is no internal-provider throughput, model routing, user revenue or cost telemetry. Do not label a modeled deficit as a known loss or subsidy.

See research/catalog.json for directly linked official pricing pages, AWS, EIA, Uptime Institute, BLS, MLCommons and SEC documentation.

## Layout

- research/catalog.json — reviewed facts, source registry, assumed cost parameters
- src/ai_economics/model.py — dependency-free task and macro reference cost models
- src/ai_economics/app.py — source hashing, SQLite monitoring, static export and local preview
- site/ — guided viewport-sized estimator, hypothetical macro explorer, research evidence, browser diagnostic download
- tests/ — Python monitor/model regression tests, JavaScript parity, CI-only desktop/mobile Playwright smoke tests
- systemd/ — optional unprivileged scheduled job on OCI
- scripts/ — server preparation and local preview convenience script
- .github/workflows/ci.yml — automated offline checks

## Security

The repo is public. Do not commit personal API tokens, private SSH keys, installation-specific IP addresses, secrets, user conversations, or private website deployment credentials.

No analytics, trackers or user prompt uploads are present. The calculator runs in visitors' browsers. Systemd writes only to /opt/ai-economics/var and /opt/ai-economics/site/data.

## Planned extensions

1. Validate local browser preview on purgatory01 and tune phone/desktop layout.
2. Implement EIA/BLS/SEC structured ingestion with robust schema checks and provenance.
3. Ingest and normalize model-specific throughput results for specific hardware; the present eight-H100 proxy is unbenchmarked. 
4. Calibrate compute and personnel scenarios and add historical trend charts.
5. Automate review-gated updates to the existing static website snapshot; the initial Vercel deployment is complete, but automatic refresh/publishing is not yet configured.
