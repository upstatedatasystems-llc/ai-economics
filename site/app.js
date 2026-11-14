/* Pure client-side calculations. No user usage or prompt data is transmitted. */
"use strict";
(function () {
  var catalog = null;
  var defaults = {};
  var number = new Intl.NumberFormat("en-US", {maximumFractionDigits: 0});
  var money = new Intl.NumberFormat("en-US", {style: "currency", currency: "USD", maximumFractionDigits: 2});
  var ids = ["responses","input","output","cache","reasoning","provider","plan","ownership",
    "gpu_effective_tokens_s","utilization","fleet_nodes","operations_fte",
    "fully_loaded_salary_usd","corporate_overhead_fraction"];
  function el(id) { return document.getElementById(id); }
  function fmt(n) { return money.format(n); }
  function numeric(id) { return Number(el(id).value); }
  function setText(id, value) { el(id).textContent = value; }
  function readParameters() {
    var a = {};
    Object.keys(catalog.assumptions).forEach(function (key) { a[key] = catalog.assumptions[key].value; });
    ["gpu_effective_tokens_s","utilization","fleet_nodes","operations_fte",
     "fully_loaded_salary_usd","corporate_overhead_fraction"].forEach(function (key) {
      var n = numeric(key);
      var spec = catalog.assumptions[key];
      if (!Number.isFinite(n)) { n = spec.value; }
      a[key] = Math.max(spec.min, Math.min(spec.max, n));
    });
    return a;
  }
  function calculate(provider, scenario) {
    var a = Object.assign({}, readParameters(), scenario || {});
    var refs = {};
    Object.keys(catalog.references).forEach(function (key) {refs[key] = catalog.references[key].value;});
    var responseCount = numeric("responses");
    var uncached = numeric("input") * (1 - numeric("cache") / 100);
    var cached = numeric("input") - uncached;
    var output = numeric("output") * numeric("reasoning");
    var weighted = responseCount * (uncached * a.input_compute_weight
      + cached * a.cached_input_compute_weight + output);
    var api = responseCount * (uncached * provider.input_usd_m
      + cached * provider.cached_input_usd_m + output * provider.output_usd_m) / 1000000;
    var annualCloud = refs.h100_p5_8gpu_usd_hour * 8760;
    var annualOwned = a.owned_hardware_usd / a.depreciation_years
      + a.server_avg_power_kw * refs.pue * refs.electricity_usd_kwh * 8760
      + a.owned_hardware_usd * a.facility_maintenance_fraction;
    var perNode = el("ownership").value === "cloud" ? annualCloud : annualOwned;
    var annualOpsPerNode = a.operations_fte * a.fully_loaded_salary_usd
      * (1 + a.corporate_overhead_fraction) / a.fleet_nodes;
    var capacity = a.gpu_effective_tokens_s * 3600 * 8760 * a.utilization;
    var direct = weighted / capacity * perNode;
    var ops = weighted / capacity * annualOpsPerNode;
    var consumer = el("plan").value === "paid" ? provider.subscription_usd_month : 0;
    return {consumer:consumer, api:api, direct:direct, ops:ops, total:direct + ops,
      subscriptionMargin: consumer - direct - ops, apiMargin:api - direct - ops};
  }
  function updateOutputs() {
    setText("responses-value", number.format(numeric("responses")));
    setText("input-value", number.format(numeric("input")));
    setText("output-value", number.format(numeric("output")));
    setText("cache-value", numeric("cache") + "%");
    setText("reasoning-value", numeric("reasoning").toFixed(2) + "×");
  }
  function newNode(tag, className, text) {
    var node = document.createElement(tag);
    if (className) { node.className = className; }
    if (text !== undefined) { node.textContent = text; }
    return node;
  }
  function drawBars(v) {
    var root = el("bars");
    root.replaceChildren();
    var rows = [
      ["Consumer subscription",v.consumer,"consumer"],
      ["Equivalent API retail",v.api,"api"],
      ["Infrastructure expense",v.direct,"infra"],
      ["Operations and admin",v.ops,"ops"]
    ];
    var max = Math.max(0.01, v.consumer, v.api, v.direct, v.ops);
    rows.forEach(function (row) {
      var wrap = newNode("div","bar-item");
      var title = newNode("div","bar-title");
      title.append(newNode("span", "", row[0]), newNode("strong", "", fmt(row[1])));
      var track = newNode("div","track");
      var bar = newNode("div","fill " + row[2]);
      bar.style.width = (row[1] / max * 100).toFixed(2) + "%";
      track.append(bar);
      wrap.append(title, track);
      root.append(wrap);
    });
  }
  function render() {
    if (!catalog) {return;}
    var provider = catalog.providers.find(function (p) {return p.id === el("provider").value;});
    if (!provider) {return;}
    updateOutputs();
    var base = calculate(provider);
    var ref = readParameters();
    var optimistic = calculate(provider, {gpu_effective_tokens_s: Math.min(6000, ref.gpu_effective_tokens_s * 1.8),
      utilization: Math.min(.85, ref.utilization * 1.25), operations_fte: Math.max(8, ref.operations_fte * .6),
      fleet_nodes: Math.min(3000, ref.fleet_nodes * 1.5)});
    var conservative = calculate(provider, {gpu_effective_tokens_s: Math.max(500, ref.gpu_effective_tokens_s * .5),
      utilization: Math.max(.25, ref.utilization * .65), operations_fte: Math.min(120, ref.operations_fte * 1.6),
      fleet_nodes: Math.max(20, ref.fleet_nodes * .7)});
    setText("paid",fmt(base.consumer));
    setText("api",fmt(base.api));
    setText("infra",fmt(base.direct));
    setText("ops",fmt(base.ops));
    setText("total",fmt(base.total));
    setText("consumer-margin",fmt(base.subscriptionMargin));
    setText("api-margin",fmt(base.apiMargin));
    setText("low",fmt(optimistic.total));
    setText("base",fmt(base.total));
    setText("high",fmt(conservative.total));
    setText("scenario-label",provider.model_name + " · " + (el("ownership").value === "cloud" ? "Cloud" : "Owned") + " scenario");
    setText("interpretation", base.subscriptionMargin < 0
      ? "Modeled serving cost exceeds the user's direct payment in this scenario. This is not evidence of an actual provider loss."
      : "The user's direct payment exceeds modeled serving cost in this scenario. This is not a measured profit figure.");
    drawBars(base);
  }
  function sources(data, health) {
    var parent = el("sources");
    parent.replaceChildren();
    data.sources.forEach(function (s) {
      var div = newNode("div","source");
      var a = newNode("a", "", s.name);
      a.href = s.url;
      a.rel = "noopener noreferrer";
      a.target = "_blank";
      var badge = newNode("span", "", s.kind);
      div.append(a,badge);
      parent.append(div);
    });
    var errors = health.sources.filter(function (s) {return s.status === "fetch_error";}).length;
    var flags = health.sources.filter(function (s) {return s.status === "review_required";}).length;
    setText("monitor", health.last_collection
      ? "Last source check: " + new Date(health.last_collection).toLocaleString() + " · " + flags + " review flags · " + errors + " fetch errors"
      : "Research source checks have not run yet.");
  }
  function reset() {
    Object.keys(defaults).forEach(function (id) {el(id).value = defaults[id];});
    render();
  }
  async function start() {
    try {
      var res = await fetch("./data/research.json", {cache:"no-store"});
      if (!res.ok) {throw Error("Research snapshot not found. Run: python3 -m ai_economics build");}
      catalog = await res.json();
      if (catalog.schema_version !== 1) {throw Error("Unsupported research catalog version");}
      var providerEl = el("provider");
      catalog.providers.forEach(function (p) {
        var option = newNode("option","",p.name + " · " + p.model_name);
        option.value = p.id;
        providerEl.append(option);
      });
      Object.keys(catalog.assumptions).forEach(function (key) {
        if (el(key)) {el(key).value = catalog.assumptions[key].value;}
      });
      ids.forEach(function (id) {defaults[id] = el(id).value;});
      ids.forEach(function (id) {
        el(id).addEventListener("input",render);
        el(id).addEventListener("change",render);
      });
      el("reset").addEventListener("click",reset);
      setText("reviewed","Reviewed baseline: " + catalog.reviewed_at);
      var status = {sources:[],last_collection:null};
      try {
        var statusResponse = await fetch("./data/health.json",{cache:"no-store"});
        if (statusResponse.ok) { status = await statusResponse.json(); }
      } catch (_) { /* Monitor status is optional for local preview. */ }
      sources(catalog,status);
      el("loading").hidden = true;
      el("dashboard").hidden = false;
      render();
    } catch (err) {
      el("loading").hidden = true;
      el("error").hidden = false;
      setText("error","Could not load the calculator: " + String(err.message || err));
    }
  }
  start();
})();
