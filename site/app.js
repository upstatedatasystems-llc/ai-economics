/* AI Economics v0.3 — UI. User input stays in the browser. */
"use strict";
(function () {
  var core = window.AiEconomicsCore;
  var data = null, samples = [], chosen = "quick", currentPeriod = "month";
  var latest = null, latestMacro = null;
  var $ = function (id) {return document.getElementById(id);};
  var integer = new Intl.NumberFormat("en-US", {maximumFractionDigits:0});
  function val(id) {return Number($(id).value);}
  function text(id,v) {$(id).textContent=String(v);}
  function amount(n) {
    if (!Number.isFinite(n)) return "—";
    var absolute = Math.abs(n);
    if (absolute>=1e12) return "$"+(n/1e12).toFixed(2)+"T";
    if (absolute>=1e9) return "$"+(n/1e9).toFixed(2)+"B";
    if (absolute>=1e6) return "$"+(n/1e6).toFixed(2)+"M";
    return new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",
      minimumFractionDigits:2, maximumFractionDigits:absolute>0 && absolute<1 ? 5 : 2}).format(n);
  }
  function count(n) {
    if (n>=1e12) return (n/1e12).toFixed(2)+"T";
    if (n>=1e9) return (n/1e9).toFixed(2)+"B";
    if (n>=1e6) return (n/1e6).toFixed(2)+"M";
    return integer.format(n);
  }
  function node(tag,className,content) {
    var n=document.createElement(tag);
    if(className) n.className=className;
    if(content!==undefined) n.textContent=content;
    return n;
  }
  function chosenSample() {return samples.find(function(w){return w.id===chosen;});}
  function sourceRows() {
    var parent=$("sources");parent.replaceChildren();
    data.sources.forEach(function(s) {
      var row=node("div","source");
      var a=node("a","",s.name);
      a.href=s.url;a.target="_blank";a.rel="noopener noreferrer";
      row.append(a,node("span","",s.kind));
      parent.append(row);
    });
  }
  function bars(target,rows) {
    var box=$(target);box.replaceChildren();
    var biggest=Math.max(0.00001,...rows.map(function(row){return Math.abs(row[1]);}));
    rows.forEach(function(row){
      var container=node("div","bar-item");
      var title=node("div","bar-title");
      title.append(node("span","",row[0]),node("strong","",amount(row[1])));
      var track=node("div","track"),fill=node("div","fill "+(row[2]||""));
      fill.style.width=(100*Math.max(0,row[1])/biggest).toFixed(2)+"%";
      track.append(fill);container.append(title,track);box.append(container);
    });
  }
  function setupExamples() {
    var target=$("examples");
    samples.forEach(function(w){
      var button=node("button","example-card");
      button.type="button";button.dataset.id=w.id;
      button.append(node("small","sample-kind",w.kind));
      button.append(node("strong","",w.name));
      button.append(node("span","",w.subtitle));
      button.addEventListener("click",function(){setExample(w.id);});
      target.append(button);
    });
  }
  function setExample(id) {
    chosen=id;
    var w=chosenSample();
    Array.from($("examples").children).forEach(function(button){
      var active=button.dataset.id===id;
      button.classList.toggle("selected",active);
      button.setAttribute("aria-pressed",active?"true":"false");
    });
    text("example-name",w.name);
    text("example-desc",w.description);
    text("example-prompt",w.example_prompt || "Paste a question or a complete prompt below.");
    text("shape-turns",count(w.user_turns));
    text("shape-calls",count(w.model_calls));
    text("shape-tools",count(w.tool_executions));
    $("custom-text").hidden=(id!=="custom");
    $("model-calls").value=w.model_calls;
    $("input").value=w.input_tokens_per_call;
    $("output").value=w.visible_output_tokens_per_call;
    $("cache").value=Math.round(w.cached_input_fraction*100);
    $("reasoning").value=w.billed_output_multiplier;
    $("repeats").value=w.tasks_per_month;
    $("extra-tool-cost").value="";
    if(id==="custom") updateCustom(false);
    render();
  }
  function updateCustom(shouldRender) {
    if(chosen!=="custom") return;
    var prompt=$("question-text").value,answer=$("answer-text").value;
    var qt=core.textTokenEstimate(prompt),at=core.textTokenEstimate(answer);
    var context=Math.max(0,val("context-tokens"));
    if(prompt.trim()) $("input").value=qt+context;
    else $("input").value=300;
    if(answer.trim()) $("output").value=at;
    else $("output").value=320;
    text("question-count",prompt.trim()
      ?count(qt)+" estimated prompt tokens + "+count(context)+" context allowance"
      :"No prompt pasted; using 300 input tokens");
    text("answer-count",answer.trim()?count(at)+" estimated visible output tokens":
      "No answer pasted; using 320 estimated visible output tokens");
    if(shouldRender)render();
  }
  function taskConfig() {
    var a={};
    Object.keys(data.assumptions).forEach(function(k) {
      if($(k)) a[k]=val(k);
    });
    var rawTool=$("extra-tool-cost").value.trim();
    return {paid:$("plan").value==="paid",ownership:$("ownership").value,
      repeats:val("repeats"),extraToolCost:rawTool===""?null:Number(rawTool),
      assumptions:a};
  }
  function activeProfile() {
    var sample=chosenSample();
    return Object.assign({},sample,{
      model_calls:Math.max(1,Math.floor(val("model-calls"))),
      input_tokens_per_call:Math.max(0,Math.floor(val("input"))),
      visible_output_tokens_per_call:Math.max(0,Math.floor(val("output"))),
      cached_input_fraction:Math.max(0,Math.min(1,val("cache")/100)),
      billed_output_multiplier:Math.max(1,val("reasoning")),
      tasks_per_month:Math.max(1,Math.floor(val("repeats")))
    });
  }
  function renderTokenStats(t) {
    var fields=[
      ["Input tokens",t.input,"Across all model calls"],
      ["Cached input",t.cached,"Subset of input total"],
      ["Uncached input",t.uncached,"Processed at full input rate"],
      ["Visible output",t.visible_output,"Generated text in this scenario"],
      ["Additional output",t.hidden_output,"Modeled reasoning/tool instructions"],
      ["Billed output total",t.billed_output,"Used for API retail comparison"]
    ];
    var root=$("token-stats");root.replaceChildren();
    fields.forEach(function(f){
      var card=node("div","token-stat");
      card.append(node("strong","",count(f[1])),node("span","",f[0]),node("small","",f[2]));
      root.append(card);
    });
    var bar=$("token-bar");bar.replaceChildren();
    var slices=[["uncached",t.uncached],["cached",t.cached],["output",t.billed_output]];
    var total=slices.reduce(function(sum,s){return sum+s[1];},0);
    slices.forEach(function(s){
      var segment=node("div","token-segment "+s[0]);
      segment.style.width=(total?100*s[1]/total:0)+"%";
      segment.title=s[0]+": "+count(s[1])+" tokens";
      bar.append(segment);
    });
  }
  function render() {
    if(!data) return;
    var profile=activeProfile(),cfg=taskConfig();
    var provider=$("provider").value;
    var result=core.task(data,provider,profile,cfg);
    latest={result:result,profile:profile,provider:provider,cfg:cfg};
    var sensitivity=core.sensitivity(data,provider,profile,cfg);
    text("result-heading","Cost of "+chosenSample().name.toLowerCase());
    text("task-subscription",amount(result.subscription_share));
    text("task-api",amount(result.api));
    text("task-infra",amount(result.infra));
    text("task-ops",amount(result.ops));
    text("task-total",amount(result.task_total_if_specified===null?result.total:result.task_total_if_specified));
    text("task-total-label",result.tool_cost===null
      ?"Modeled inference + operations only"
      :"Modeled inference, operations and entered tools");
    text("task-share",amount(result.subscription_share));
    text("call-api",amount(result.api/result.calls));
    text("tool-warning",result.tool_cost===null
      ?(profile.tool_executions>0
        ? count(profile.tool_executions)+" tool executions in this example have no known prices and are excluded. Total real execution cost could be higher."
        :"No external tool cost included. Other routing and non-text services remain unpriced.")
      :"You entered "+amount(result.tool_cost)+" per task for external execution. This is user supplied, not independently researched.");
    text("result-caveat","Workload inputs are an illustrative scenario, not observed usage. The user receives a fixed subscription for their payment; the per-task subscription share is a simple allocation, NOT a charge per request. The model currently uses the same illustrative GPU performance proxy across all providers.");
    bars("bars",[
      ["Subscription allocation",result.subscription_share,""],
      ["Equivalent API retail",result.api,"api"],
      ["Compute infrastructure",result.infra,"infra"],
      ["Operations/admin",result.ops,"ops"]
    ]);
    text("low",amount(sensitivity.optimistic));
    text("base",amount(sensitivity.baseline));
    text("high",amount(sensitivity.conservative));
    renderTokenStats(result.tokens);
    text("workload-explainer",
      chosen==="coding" ? "This example assumes "+count(profile.model_calls)+" model calls across "+count(profile.user_turns)+" user turns, plus "+count(profile.tool_executions)+" separate tool executions. Every model call reprocesses some code and context. Build and deployment resources are not included without an explicit tool-cost estimate."
      : chosen==="brainstorm" ? "The model makes "+count(profile.model_calls)+" calls across "+count(profile.user_turns)+" turns. Later prompts may include earlier answers and instructions, so input tokens accumulate beyond the user's newly typed words."
      : chosen==="custom" ? "Your pasted text is converted into an approximate visible-token count; model routing, hidden context, caching and internal tool calls can differ considerably."
      : "One user question generally produces one answer in this scenario. That is one model call, with modest input context and output tokens. Real requests may use additional unseen routing or tools.");
    text("month-label",count(result.repeats)+" completed tasks");
    text("month-consumer",amount(result.subscription_month));
    text("month-api",amount(result.monthly_api));
    text("month-model",amount(result.monthly_serving));
    text("month-diff",amount(result.monthly_consumer_margin));
  }
  function macroProfiles(target) {
    var select=$(target);
    samples.filter(function(w){return w.id!=="custom";}).forEach(function(w){
      var option=node("option","",w.name);
      option.value=w.id;select.append(option);
    });
  }
  function loadMacroValues(providerId) {
    var d=data.macro.profiles[providerId];
    if(!d)return;
    $("macro-paid-users").value=d.paid_users;
    $("macro-free-users").value=d.free_users;
    $("macro-paid-tasks").value=d.paid_tasks_per_user;
    $("macro-free-tasks").value=d.free_tasks_per_user;
    $("macro-api-tasks").value=d.api_tasks_per_month;
    $("macro-paid-profile").value=d.paid_profile;
    $("macro-free-profile").value=d.free_profile;
    $("macro-api-profile").value=d.api_profile;
    $("macro-ad-arpu").value=d.ad_usd_per_free_user_month;
    $("macro-api-realization").value=d.api_realization*100;
    $("macro-other-annual").value=d.additional_annual_expense_usd;
    $("macro-ownership").value="cloud";
    renderMacro();
  }
  function macroConfig() {
    return {
      paid_users:val("macro-paid-users"),free_users:val("macro-free-users"),
      paid_tasks_per_user:val("macro-paid-tasks"),free_tasks_per_user:val("macro-free-tasks"),
      api_tasks_per_month:val("macro-api-tasks"),
      paid_profile:$("macro-paid-profile").value,
      free_profile:$("macro-free-profile").value,
      api_profile:$("macro-api-profile").value,
      ad_usd_per_free_user_month:val("macro-ad-arpu"),
      api_realization:val("macro-api-realization")/100,
      additional_annual_expense_usd:val("macro-other-annual"),
      ownership:$("macro-ownership").value
    };
  }
  function renderReported(providerId) {
    var root=$("reported");root.replaceChildren();
    var relevant=data.macro.reported_context.filter(function(item){return item.provider===providerId;});
    if(!relevant.length) {root.append(node("p","muted","No vetted disclosures for this provider."));return;}
    relevant.forEach(function(item){
      var box=node("article","reported-card");
      var a=node("a","",item.metric);
      a.href=item.source_url;a.target="_blank";a.rel="noopener noreferrer";
      box.append(a,node("strong","",amount(item.value_usd)),
        node("small","",item.period),
        node("p","small muted",item.scope),
        node("p","small muted",item.note));
      root.append(box);
    });
  }
  function renderMacro() {
    if(!data || !data.macro)return;
    var providerId=$("macro-provider").value;
    if(!providerId)return;
    var config=macroConfig(),result=core.macro(data,providerId,samples,config);
    latestMacro={result:result,provider:providerId,config:config};
    var period=result[currentPeriod];
    text("macro-revenue",amount(period.revenue));
    text("macro-serving",amount(period.serving_cost));
    text("macro-extra",amount(period.other_expense));
    text("macro-balance",amount(period.estimated_balance));
    bars("macro-revenue-bars",[
      ["Paid subscriptions",period.subscriptions,""],
      ["Assumed free-user ads",period.ads,"ops"],
      ["Realized API billing",period.api_revenue,"api"]
    ]);
    bars("macro-cost-bars",[
      ["Consumer serving",period.consumer_serving,"infra"],
      ["API serving",period.api_serving,"ops"],
      ["Extra annual allowance",period.other_expense,"api"]
    ]);
    text("macro-tasks",count(result.paid_tasks_month+result.free_tasks_month+result.api_tasks_month));
    text("macro-calls",count(result.total_model_calls_month));
    document.querySelectorAll(".period-button").forEach(function(b){
      var active=b.dataset.period===currentPeriod;
      b.classList.toggle("selected",active);b.setAttribute("aria-pressed",active?"true":"false");
    });
    renderReported(providerId);
  }
  function init() {
    samples=data.workloads.examples;
    var options=$("provider"),macro=$("macro-provider");
    data.providers.forEach(function(p) {
      var label=p.name+" · "+p.model_name;
      var first=node("option","",label);first.value=p.id;options.append(first);
      var second=node("option","",p.name);second.value=p.id;macro.append(second);
    });
    ["macro-paid-profile","macro-free-profile","macro-api-profile"].forEach(macroProfiles);
    Object.keys(data.assumptions).forEach(function(k){
      if($(k))$(k).value=data.assumptions[k].value;
    });
    setupExamples();
    [
      "provider","plan","ownership","model-calls","input","output","cache","reasoning",
      "repeats","extra-tool-cost","gpu_effective_tokens_s","utilization",
      "fleet_nodes","operations_fte","fully_loaded_salary_usd","corporate_overhead_fraction"
    ].forEach(function(id){$(id).addEventListener("input",render);$(id).addEventListener("change",render);});
    ["question-text","answer-text","context-tokens"].forEach(function(id){
      $(id).addEventListener("input",function(){updateCustom(true);});
    });
    $("reset").addEventListener("click",function(){setExample(chosen);});
    $("copy").addEventListener("click",async function() {
      if(!latest) return;
      var r=latest.result;
      var lines=[
        "AI Economics illustrative task estimate — "+chosenSample().name,
        "Model: "+r.provider.name+" / "+r.provider.model_name,
        "Turns: "+r.turns+"; model calls: "+r.calls+"; tool executions: "+r.tools,
        "Input: "+Math.round(r.tokens.input)+" tokens; billed output: "+Math.round(r.tokens.billed_output)+" tokens",
        "Consumer subscription allocation: "+amount(r.subscription_share),
        "Equivalent API retail: "+amount(r.api),
        "Modeled infrastructure: "+amount(r.infra),
        "Allocated operations: "+amount(r.ops),
        "Modeled inference subtotal: "+amount(r.total),
        "External execution: "+(r.tool_cost===null?"unknown and excluded":amount(r.tool_cost)),
        "Not a measurement of actual provider costs or usage.",
        "https://github.com/upstatedatasystems-llc/ai-economics"
      ];
      try {await navigator.clipboard.writeText(lines.join("\n"));text("copy","Copied");}
      catch (_) {text("copy","Copy unavailable");}
    });
    $("macro-provider").addEventListener("change",function(){loadMacroValues($("macro-provider").value);});
    $("macro-reset").addEventListener("click",function(){loadMacroValues($("macro-provider").value);});
    ["macro-ownership","macro-paid-users","macro-free-users","macro-paid-tasks","macro-free-tasks",
      "macro-api-tasks","macro-paid-profile","macro-free-profile","macro-api-profile",
      "macro-ad-arpu","macro-api-realization","macro-other-annual"
    ].forEach(function(id){$(id).addEventListener("input",renderMacro);$(id).addEventListener("change",renderMacro);});
    document.querySelectorAll(".period-button").forEach(function(button){
      button.addEventListener("click",function(){currentPeriod=button.dataset.period;renderMacro();});
    });
    text("reviewed","Reference date: "+data.reviewed_at);
    sourceRows();
    fetch("./data/health.json",{cache:"no-store"}).then(function(response){return response.ok?response.json():null;})
      .then(function(health){
        if(!health || !health.last_collection){text("monitor","Not checked by server yet");return;}
        var flags=health.sources.filter(function(s){return s.status==="review_required";}).length;
        var failures=health.sources.filter(function(s){return s.status==="fetch_error";}).length;
        text("monitor","Last check "+new Date(health.last_collection).toLocaleString()+" · "+flags+" review flags · "+failures+" failures");
      }).catch(function(){text("monitor","Source status unavailable");});
    $("loading").hidden=true;$("dashboard").hidden=false;
    setExample("quick");
    loadMacroValues($("macro-provider").value);
  }
  fetch("./data/research.json",{cache:"no-store"}).then(function(res){
    if(!res.ok)throw new Error("Research snapshot not found. Run the Python build command.");
    return res.json();
  }).then(function(value){
    data=value;
    if(data.schema_version!==1 || !data.workloads || !data.macro) {
      throw new Error("Unsupported snapshot. Rebuild from the current repository.");
    }
    init();
  }).catch(function(err){
    $("loading").hidden=true;$("error").hidden=false;
    text("error","Unable to load AI Economics: "+String(err.message||err));
  });
})();
