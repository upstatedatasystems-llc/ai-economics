/* AI Economics v0.4 — single-pane guided estimator.
 * All user-entered text is processed locally; diagnostics omit prompt contents.
 */
"use strict";
(function () {
  const core = window.AiEconomicsCore;
  const $ = (id) => document.getElementById(id);
  const steps = ["task", "usage", "economics", "scale", "evidence"];
  const meta = {
    task: ["Choose a starting point", "Start with a familiar task, then adjust the workload until it resembles your own."],
    usage: ["Size the work", "Describe all the model calls and tokens needed to finish one complete task."],
    economics: ["Estimate the serving cost", "Compare public API retail with hypothetical compute and operating expenses."],
    scale: ["Explore the bigger picture", "Move from your monthly usage to a hypothetical company-scale scenario."],
    evidence: ["Verify the evidence", "Inspect published sources, separate financial disclosures, and collector diagnostics."]
  };
  const formatting = new Intl.NumberFormat("en-US", {maximumFractionDigits: 0});
  let data=null,health=null,samples=[],selected="quick",step="task";
  let scaleMode="personal",period="month",evidenceTab="sources",result=null,macroResult=null;
  const errors=[];
  function logError(message) {errors.push({at:new Date().toISOString(),message:String(message).slice(0,500)});if(errors.length>30) errors.shift();}
  window.addEventListener("error", e=>logError(e.message || "Unidentified script error"));
  window.addEventListener("unhandledrejection", e=>logError(String(e.reason && e.reason.message || e.reason)));
  const number=(id,fallback=0) => {
    const e=$(id); if(!e) return fallback;
    const n=Number(e.value);if(!Number.isFinite(n))return fallback;
    const min=e.min!==""?Number(e.min):-Infinity,max=e.max!==""?Number(e.max):Infinity;
    return Math.max(min,Math.min(max,n));
  };
  const set=(id,t)=>{const e=$(id);if(e)e.textContent=String(t);};
  const count=(n)=>{
    n=Number(n)||0; const x=Math.abs(n);
    if(x>=1e12)return (n/1e12).toFixed(2)+"T";
    if(x>=1e9)return (n/1e9).toFixed(2)+"B";
    if(x>=1e6)return (n/1e6).toFixed(2)+"M";
    return formatting.format(n);
  };
  const money=(n)=>{
    if(!Number.isFinite(n))return "—";
    const abs=Math.abs(n);
    if(abs>=1e12)return "$"+(n/1e12).toFixed(2)+"T";
    if(abs>=1e9)return "$"+(n/1e9).toFixed(2)+"B";
    if(abs>=1e6)return "$"+(n/1e6).toFixed(2)+"M";
    return new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",
      minimumFractionDigits:2,maximumFractionDigits:abs>0&&abs<1?5:2}).format(n);
  };
  function element(tag,cls,content) {
    const e=document.createElement(tag);
    if(cls)e.className=cls;
    if(content!==undefined)e.textContent=String(content);
    return e;
  }
  function currentSample(){return samples.find(w=>w.id===selected);}
  function go(where){
    if(!steps.includes(where))return;
    step=where;
    document.querySelectorAll(".screen").forEach(s=>s.hidden=s.dataset.screen!==where);
    document.querySelectorAll("[data-go]").forEach(b=>{
      const active=b.dataset.go===where;b.classList.toggle("selected",active);
      if(active)b.setAttribute("aria-current","step");else b.removeAttribute("aria-current");
    });
    const i=steps.indexOf(where),n=i+1;
    set("stage-title",meta[where][0]);set("stage-description",meta[where][1]);
    set("stage-caption","STEP "+String(n).padStart(2,"0")+" OF 05");
    set("stage-pager",String(n).padStart(2,"0")+" / 05");
    $("previous").disabled=i===0;
    set("next",i===steps.length-1?"Back to start ↺":"Continue →");
    document.querySelectorAll("#progress-dots i").forEach((d,k)=>d.classList.toggle("active",k===i));
    $("stage-scroll").scrollTop=0;
    if(where==="evidence")renderEvidence();
    if(where==="scale")renderScale();
  }
  function loadSamples(){
    const icons={"quick":"?","brainstorm":"↺","coding":"</>","custom":"✎"};
    const root=$("example-options");root.replaceChildren();
    samples.forEach(w=>{
      const b=element("button","example-option");b.type="button";b.dataset.sample=w.id;
      const ico=element("span","example-ico",icons[w.id]||"•");
      const content=element("span");content.append(element("strong","",w.name),
        element("small","",w.subtitle));
      b.append(ico,content);
      b.addEventListener("click",()=>choose(w.id));
      root.append(b);
    });
  }
  function choose(id){
    if(!samples.find(w=>w.id===id))return;
    selected=id;
    const w=currentSample();
    document.querySelectorAll(".example-option").forEach(b=>{
      const active=b.dataset.sample===id;
      b.classList.toggle("selected",active);b.setAttribute("aria-pressed",String(active));
    });
    set("chosen-title",w.name);set("chosen-description",w.description);
    set("chosen-prompt",w.example_prompt||"Paste a question and optionally its answer on the next step.");
    set("chosen-turns",count(w.user_turns));set("chosen-calls",count(w.model_calls));
    set("chosen-tools",count(w.tool_executions));
    $("model-calls").value=w.model_calls;$("repeats").value=w.tasks_per_month;
    $("input").value=w.input_tokens_per_call;$("output").value=w.visible_output_tokens_per_call;
    $("cache").value=Math.round(w.cached_input_fraction*100);
    $("reasoning").value=w.billed_output_multiplier;
    $("custom-box").hidden=id!=="custom";
    if(id==="custom")updateCustom();
    recalc();
  }
  function updateCustom(){
    if(selected!=="custom")return;
    const prompt=$("question-text").value,answer=$("answer-text").value;
    if(prompt.trim())$("input").value=core.textTokenEstimate(prompt)+number("context-tokens",250);
    if(answer.trim())$("output").value=core.textTokenEstimate(answer);
  }
  function taskProfile(){
    const w=currentSample();
    return {...w,model_calls:Math.max(1,Math.round(number("model-calls",1))),
      input_tokens_per_call:Math.round(number("input")),
      visible_output_tokens_per_call:Math.round(number("output")),
      cached_input_fraction:number("cache")/100,
      billed_output_multiplier:number("reasoning",1)};
  }
  function settings(){
    const assumptions={};
    for(const key of Object.keys(data.assumptions)){
      if($(key)) assumptions[key]=number(key,data.assumptions[key].value);
    }
    return {paid:$("plan").value==="paid",ownership:$("ownership").value,
      repeats:Math.max(1,Math.round(number("repeats",1))),assumptions};
  }
  function recalc(){
    if(!data)return;
    try{
      const profile=taskProfile(),cfg=settings(),provider=$("provider").value;
      result=core.task(data,provider,profile,cfg);
      set("side-task",currentSample().name);
      set("side-task-kind",currentSample().kind.toUpperCase());
      set("side-provider",result.provider.name+" · "+result.provider.model_name);
      set("side-total",money(result.total));set("side-api",money(result.api));
      set("side-subscription",money(result.subscription_share));
      set("side-calls",count(result.calls));
      set("side-tokens",count(result.tokens.input+result.tokens.billed_output));
      set("side-cost-label","Inference + modeled operations / task");
      set("side-disclaimer",profile.tool_executions>0
        ?count(profile.tool_executions)+" external tool executions are unpriced. This is NOT a complete task expense."
        :"This is an illustrative cost model, not a measurement of the provider's actual expenses.");
      const tok=result.tokens;
      set("tokens-input",count(tok.input));set("tokens-cached",count(tok.cached));
      set("tokens-output",count(tok.billed_output));set("tokens-hidden",count(tok.hidden_output));
      const bar=$("token-bar");bar.replaceChildren();
      const pieces=[["uncached",tok.uncached],["cached",tok.cached],["output",tok.billed_output]];
      const total=pieces.reduce((acc,p)=>acc+p[1],0);
      for(const [label,value] of pieces){
        const seg=element("div",label);
        seg.style.width=(total?value/total*100:0).toFixed(3)+"%";
        seg.title=label+": "+count(value)+" tokens";
        bar.append(seg);
      }
      set("cost-api",money(result.api));set("cost-infra",money(result.infra));
      set("cost-ops",money(result.ops));set("cost-total",money(result.total));
      const ranges=core.sensitivity(data,provider,profile,cfg);
      set("cost-low",money(ranges.optimistic));set("cost-base",money(ranges.baseline));
      set("cost-high",money(ranges.conservative));
      set("personal-tasks",count(result.repeats));
      set("personal-calls",count(result.calls*result.repeats));
      set("personal-subscription",money(result.subscription_month));
      set("personal-api",money(result.monthly_api));
      set("personal-cost",money(result.monthly_serving));
      set("personal-margin",money(result.monthly_consumer_margin));
      set("rail-data-status","References "+data.reviewed_at);
      if(step==="scale")renderScale();
    }catch(err){
      logError("Recalculation: "+String(err.message||err));
      set("side-total","Check input values");
    }
  }
  function initProviderSelect(){
    for(const p of data.providers){
      const a=element("option","",p.name+" · "+p.model_name);a.value=p.id;$("provider").append(a);
      const b=element("option","",p.name);b.value=p.id;$("macro-provider").append(b);
    }
  }
  function initMacro(){
    for(const id of ["macro-paid-profile","macro-free-profile","macro-api-profile"]){
      for(const p of samples.filter(w=>w.id!=="custom")){
        const option=element("option","",p.name);option.value=p.id;$(id).append(option);
      }
    }
    macroDefaults();
  }
  function macroDefaults(){
    const d=data.macro.profiles[$("macro-provider").value];if(!d)return;
    const vals={
      "macro-paid-users":d.paid_users,"macro-paid-tasks":d.paid_tasks_per_user,
      "macro-free-users":d.free_users,"macro-free-tasks":d.free_tasks_per_user,
      "macro-api-tasks":d.api_tasks_per_month,"macro-ad-arpu":d.ad_usd_per_free_user_month,
      "macro-api-realization":d.api_realization*100,
      "macro-other-annual":d.additional_annual_expense_usd,
      "macro-paid-profile":d.paid_profile,"macro-free-profile":d.free_profile,
      "macro-api-profile":d.api_profile
    };
    for(const [id,value] of Object.entries(vals))$(id).value=value;
    renderScale();
  }
  function macroConfig(){
    return {
      paid_users:number("macro-paid-users"),free_users:number("macro-free-users"),
      paid_tasks_per_user:number("macro-paid-tasks"),free_tasks_per_user:number("macro-free-tasks"),
      api_tasks_per_month:number("macro-api-tasks"),
      paid_profile:$("macro-paid-profile").value,
      free_profile:$("macro-free-profile").value,
      api_profile:$("macro-api-profile").value,
      ad_usd_per_free_user_month:number("macro-ad-arpu"),
      api_realization:number("macro-api-realization")/100,
      additional_annual_expense_usd:number("macro-other-annual"),
      ownership:$("macro-ownership").value
    };
  }
  function renderScale(){
    if(!data||!data.macro)return;
    $("personal-view").hidden=scaleMode!=="personal";
    $("company-view").hidden=scaleMode!=="company";
    $("scale-personal").classList.toggle("selected",scaleMode==="personal");
    $("scale-company").classList.toggle("selected",scaleMode==="company");
    $("scale-personal").setAttribute("aria-pressed",String(scaleMode==="personal"));
    $("scale-company").setAttribute("aria-pressed",String(scaleMode==="company"));
    if(scaleMode==="company"){
      try{
        macroResult=core.macro(data,$("macro-provider").value,samples,macroConfig());
        const p=macroResult[period];
        set("macro-revenue",money(p.revenue));set("macro-serving",money(p.serving_cost));
        set("macro-extra",p.other_expense===0?"Not modeled":money(p.other_expense));
        set("macro-balance",money(p.estimated_balance));
        set("macro-tasks",count(macroResult.paid_tasks_month+macroResult.free_tasks_month+macroResult.api_tasks_month));
        set("macro-calls",count(macroResult.total_model_calls_month));
        set("macro-nodes",count(Math.ceil(macroResult.eight_gpu_systems_required)));
      }catch(err){logError("Macro: "+String(err.message||err));set("macro-revenue","Check inputs");}
    }
    document.querySelectorAll(".period").forEach(button=>{
      const active=button.dataset.period===period;
      button.classList.toggle("selected",active);button.setAttribute("aria-pressed",String(active));
    });
  }
  function renderSources(){
    const root=$("sources");root.replaceChildren();
    for(const s of data.sources){
      const item=element("div","source-item");
      const a=element("a","",s.name);a.href=s.url;a.target="_blank";a.rel="noopener noreferrer";
      item.append(a,element("small","",s.kind+" · "+(s.monitor_mode==="manual"?"Manual/structured feed pending":"Price-evidence monitor")));
      root.append(item);
    }
    const financial=$("reported");financial.replaceChildren();
    for(const r of data.macro.reported_context){
      const item=element("div","source-item");
      const a=element("a","",r.provider.toUpperCase()+" — "+r.metric);
      a.href=r.source_url;a.target="_blank";a.rel="noopener noreferrer";
      item.append(a,element("small","",money(r.value_usd)+" · "+r.period),
        element("small","",r.scope),element("small","",r.note));
      financial.append(item);
    }
  }
  function renderHealth(){
    const root=$("source-status");root.replaceChildren();
    const sources=health&&health.sources||[];
    const nmanual=sources.filter(s=>s.status==="manual_review").length;
    const ncandidate=sources.filter(s=>s.status==="candidate_change").length;
    const nblocked=sources.filter(s=>s.status==="blocked").length;
    const nfailed=sources.filter(s=>s.status==="fetch_error").length;
    const nnot=sources.filter(s=>s.status==="not_checked").length;
    set("collector-summary",(health&&health.last_collection
      ? "Last monitored: "+new Date(health.last_collection).toLocaleString()
      : "No source-monitoring collection yet")+
      ". "+nmanual+" manual sources, "+ncandidate+" candidate changes, "+
      nblocked+" blocked, "+nfailed+" transient failures, "+nnot+" not checked.");
    for(const source of data.sources){
      const obs=sources.find(v=>v.id===source.id)||{status:"not_checked"};
      const item=element("div","source-item");
      const title=element("a","",source.name);title.href=source.url;title.target="_blank";title.rel="noopener noreferrer";
      const flag=["candidate_change","blocked","fetch_error","unverifiable"].includes(obs.status)?"warning":
        ["unchanged","acknowledged"].includes(obs.status)?"good":"";
      const status=element("span","status-label "+flag,(obs.status||"not_checked").replace(/_/g," "));
      item.append(title,status);
      if(obs.checked_at)item.append(element("small","",new Date(obs.checked_at).toLocaleString()));
      if(obs.error)item.append(element("small","",obs.error));
      root.append(item);
    }
  }
  function renderEvidence(){
    const mode=evidenceTab;
    for(const id of ["sources","financial","health"]){
      $("evidence-"+id).hidden=mode!==id;
    }
    document.querySelectorAll(".evidence-toggle").forEach(btn=>{
      const active=btn.dataset.evidence===mode;
      btn.classList.toggle("selected",active);btn.setAttribute("aria-pressed",String(active));
    });
    if(mode==="health")renderHealth();
  }
  function downloadDiagnostics(){
    // Never include text input contents or server credentials.
    const report={
      schema_version:1,generated_at:new Date().toISOString(),app_version:"0.4",
      current_step:step,selected_example:selected,provider:$("provider").value,
      plan:$("plan").value,ownership:$("ownership").value,
      viewport:{width:window.innerWidth,height:window.innerHeight},
      workload:{
        model_calls:number("model-calls"),tasks_per_month:number("repeats"),
        input_tokens:number("input"),output_tokens:number("output"),
        cached_fraction:number("cache")/100,output_multiplier:number("reasoning")
      },
      estimated_costs:result?{per_task_serving:result.total,api_retail:result.api,
        monthly_serving:result.monthly_serving}:null,
      collector_summary:health?health.summary||{}:null,
      research_generated_at:data?data.generated_at:null,
      errors:errors.slice(),privacy:"No pasted prompt/answer text or secrets included"
    };
    const blob=new Blob([JSON.stringify(report,null,2)],{type:"application/json"});
    const link=document.createElement("a");
    const url=URL.createObjectURL(blob);link.href=url;link.download="ai-economics-browser-diagnostics.json";
    document.body.append(link);link.click();link.remove();URL.revokeObjectURL(url);
  }
  function copyEstimate(){
    if(!result)return;
    const lines=[
      "AI Economics v0.4 — illustrative task: "+currentSample().name,
      "Provider: "+result.provider.name+" / "+result.provider.model_name,
      "Model calls: "+result.calls+", inputs: "+Math.round(result.tokens.input)+" tokens",
      "Billed output: "+Math.round(result.tokens.billed_output)+" tokens",
      "API-equivalent retail: "+money(result.api),
      "Modeled serving subtotal: "+money(result.total),
      "Subscription share: "+money(result.subscription_share),
      "External execution and actual provider spending not known.",
      "https://github.com/upstatedatasystems-llc/ai-economics"
    ].join("\n");
    if(navigator.clipboard&&navigator.clipboard.writeText){
      navigator.clipboard.writeText(lines).then(()=>set("copy","Copied")).catch(e=>{logError("Copy: "+e.message);set("copy","Copy unavailable");});
    }else{set("copy","Clipboard unavailable");}
  }
  function bindEvents(){
    for(const button of document.querySelectorAll("[data-go]"))button.addEventListener("click",()=>go(button.dataset.go));
    for(const button of document.querySelectorAll(".evidence-toggle"))button.addEventListener("click",()=>{
      evidenceTab=button.dataset.evidence;renderEvidence();
    });
    for(const button of document.querySelectorAll(".period"))button.addEventListener("click",()=>{
      period=button.dataset.period;renderScale();
    });
    $("previous").addEventListener("click",()=>go(steps[Math.max(0,steps.indexOf(step)-1)]));
    $("next").addEventListener("click",()=>go(steps[Math.min(steps.length-1,steps.indexOf(step)+1)]==="evidence"&&step==="evidence"?"task":steps[Math.min(steps.length-1,steps.indexOf(step)+1)]));
    $("scale-personal").addEventListener("click",()=>{scaleMode="personal";renderScale();});
    $("scale-company").addEventListener("click",()=>{scaleMode="company";renderScale();});
    $("reset").addEventListener("click",()=>choose(selected));
    $("macro-reset").addEventListener("click",macroDefaults);
    $("macro-provider").addEventListener("change",macroDefaults);
    $("copy").addEventListener("click",copyEstimate);
    $("download-diagnostics").addEventListener("click",downloadDiagnostics);
    for(const id of ["provider","plan","ownership","model-calls","repeats","input","output",
      "cache","reasoning","gpu_effective_tokens_s","utilization","fleet_nodes",
      "operations_fte","fully_loaded_salary_usd","corporate_overhead_fraction"]){
      $(id).addEventListener("input",recalc);
      $(id).addEventListener("change",recalc);
    }
    for(const id of ["question-text","answer-text","context-tokens"]){
      $(id).addEventListener("input",()=>{updateCustom();recalc();});
    }
    for(const id of ["macro-ownership","macro-paid-users","macro-paid-tasks","macro-free-users",
      "macro-free-tasks","macro-api-tasks","macro-paid-profile","macro-free-profile",
      "macro-api-profile","macro-api-realization","macro-ad-arpu","macro-other-annual"]){
      $(id).addEventListener("input",renderScale);
      $(id).addEventListener("change",renderScale);
    }
  }
  async function start(){
    try{
      if(!core)throw Error("Calculator engine not loaded.");
      const response=await fetch("./data/research.json",{cache:"no-store"});
      if(!response.ok)throw Error("Research snapshot missing. Run the Python build command.");
      data=await response.json();
      if(data.schema_version!==1||!data.workloads||!data.macro)throw Error("Unsupported snapshot. Rebuild with current code.");
      samples=data.workloads.examples;
      initProviderSelect();
      for(const [key,meta] of Object.entries(data.assumptions)){
        if($(key))$(key).value=meta.value;
      }
      loadSamples();
      bindEvents();
      initMacro();
      renderSources();
      set("reviewed",data.reviewed_at);
      for(let i=0;i<steps.length;i++)$("progress-dots").append(element("i",""));
      $("stage-body").hidden=false;$("loading").hidden=true;
      choose("quick");go("task");
      try{
        const res=await fetch("./data/health.json",{cache:"no-store"});
        if(res.ok)health=await res.json();
        renderHealth();
      }catch(err){logError("Health fetch: "+String(err.message||err));}
    }catch(err){
      logError("Start: "+String(err.message||err));
      $("loading").hidden=true;$("error").hidden=false;
      set("error","Unable to load calculator: "+String(err.message||err));
    }
  }
  start();
})();
