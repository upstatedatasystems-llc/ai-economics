# AI Economics

Research-based public calculator comparing AI **consumer subscription payments**, **equivalent API retail charges**, **modeled inference infrastructure**, and **allocated operations / administration**, at both a **completed-task** scale and an **illustrative company-scale** daily/monthly/yearly scale.

Published by Upstate Data Systems LLC. Designed to run source monitoring and static research exports on **purgatory01** (lightweight Oracle Cloud AMD64 VM), then display a self-contained calculator on upstatedatasystems.com/ai-economics.

**Status: v0.3 local test prototype. Not deployed to purgatory01 or Vercel.** No AI models are run, and no paid AI APIs or GPUs are required.

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
    sudo git clone https://github.com/upstatedatasystems-llc/ai-economics.git /opt/ai-economics
    cd /opt/ai-economics
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

After reviewing the files, from /opt/ai-economics:

    sudo bash scripts/prepare-purgatory01.sh
    sudo systemctl enable --now ai-economics-refresh.timer
    sudo systemctl start ai-economics-refresh.service
    sudo journalctl -u ai-economics-refresh.service -n 80 --no-pager
    PYTHONPATH=src python3 -m ai_economics health

The timer executes daily at approximately 04:15 UTC, with randomized delay. Each run checks the upstream public sources and stores SHA-256 digests, timestamps and status in a local SQLite database. The job is capped at 160 MB RAM and 40% CPU and does not bind a network port. Failed fetches do not erase last-reviewed pricing.

Important: for phase one, this is an **automated change monitor**. Pricing facts are kept in version-controlled research/catalog.json and are not silently overwritten when a supplier edits a page. Review updated sources, update reviewed facts, and optionally acknowledge a checked source with:

    PYTHONPATH=src python3 -m ai_economics ack-source openai_api

Acknowledgment only marks a digest as checked. It does NOT automatically alter pricing.

Adding structured EIA, BLS, SEC and benchmark adapters with verified numeric extraction is the next milestone; the monitoring is already ready for scheduled operation.

## Export to existing Vite website

The existing Upstate Data Systems website is a Vite project. From this project:

    PYTHONPATH=src python3 -m ai_economics export --target /tmp/ai-econ-export

Copy the resulting ai-economics folder to the website repository's public/ai-economics folder. Its Vite build will copy the content into the final site at /ai-economics/. The front end fetches versioned static JSON and calculates locally; it never queries purgatory01.

**Do not copy or deploy to Vercel until the local test has been approved.** Future automated publishing will require a narrowly scoped credential on the server or a review-based GitHub Actions workflow, never a public-site API secret.

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
- site/ — standalone task/workload calculator, hypothetical macro explorer and financial disclosures
- tests/ — offline Python and JavaScript parity/unit/generation checks
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
5. Add review-gated static publication to the existing website repo, then ship to Vercel separately.
