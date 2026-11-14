/* AI Economics v0.5 — single-pane guided estimator.
 * All user-entered text is processed locally; diagnostics omit prompt contents.
 */
"use strict";
(function () {
  const core = window.AiEconomicsCore;
  const $ = (id) => document.getElementById(id);
  const steps = ["task", "access", "usage", "economics", "scale", "evidence"];
  const meta = {
    task: ["Choose a starting point", "Start with a familiar task, then adjust the workload until it resembles your own."],
    access: ["Choose how you access AI", "Compare what subscriptions or API calls cost you against the estimated workload."],
    usage: ["Size the work", "Describe all the model calls and tokens needed to finish one complete task."],
    economics: ["Estimate the serving cost", "Compare public API retail with hypothetical compute and operating expenses."],
    scale: ["Explore the bigger picture", "Move from your monthly usage to a hypothetical company-scale scenario."],
    evidence: ["Verify the evidence", "Inspect published sources, separate financial disclosures, and collector diagnostics."]
  };
  const formatting = new Intl.NumberFormat("en-US", {maximumFractionDigits: 0});
  let data=null,health=null,samples=[],selected="quick",step="task";
  let scaleMode="personal",period="month",evidenceTab="sources",result=null,macroResult=null;
  let accessMode="subscription",portfolio=null;
  const planPrefs={openai:{enabled:true,id:"openai-plus",weight:50},
    anthropic:{enabled:false,id:"anthropic-pro",weight:0},
    google:{enabled:true,id:"google-pro",weight:50}};
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
      const active=b.dataset.go===where;
      b.classList.toggle("selected",active);
      if(active)b.setAttribute("aria-current","step");else b.removeAttribute("aria-current");
    });
    const i=steps.indexOf(where),n=i+1;
    set("stage-title",meta[where][0]);set("stage-description",meta[where][1]);
    set("stage-caption","STEP "+String(n).padStart(2,"0")+" OF 06");
    set("stage-pager",String(n).padStart(2,"0")+" / 06");
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
    $("extra-tool-cost").value="";
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
    const rawTools=$("extra-tool-cost").value.trim();
    return {ownership:$("ownership").value,
      repeats:Math.max(1,Math.round(number("repeats",1))),assumptions,
      extraToolCost:rawTools===""?null:Math.max(0,Number(rawTools))};
  }
  function recalc(){
    if(!data)return;
    try{
      const profile=taskProfile(),cfg=settings();
      portfolio=core.subscriptionPortfolio(data,data.access,profile,{
        ...cfg,mode:accessMode,api_provider:$("api-provider").value,
        selections:currentAccessSelections()
      });
      const mainProvider=portfolio.rows[0].provider_id;
      result=core.task(data,mainProvider,profile,{...cfg,paid:false});
      const included=portfolio.per_task_included_cost,pt=portfolio.total_tasks_month;
      set("side-task",currentSample().name);
      set("side-task-kind",currentSample().kind.toUpperCase());
      set("side-provider",accessMode==="api"
        ?result.provider.name+" API"
        :portfolio.rows.map(r=>r.label).join(" + "));
      set("side-total",money(included));
      set("side-api",money(portfolio.per_task_api_equivalent));
      set("side-subscription",money(portfolio.per_task_payment_allocation));
      set("side-calls",count(result.calls));
      set("side-tokens",count(result.tokens.input+result.tokens.billed_output));
      set("side-cost-label",cfg.extraToolCost==null
        ?"Inference + modeled operations / task"
        :"Inference, operations + entered tools / task");
      set("side-disclaimer",cfg.extraToolCost!==null
        ?"The external expense is supplied by you, not a measured AI-provider charge."
        :profile.tool_executions>0
          ?count(profile.tool_executions)+" tool executions are unpriced and excluded."
          :"This is a hardware/operations scenario, not an observation of company spending.");
      const tok=result.tokens;
      set("tokens-input",count(tok.input));set("tokens-cached",count(tok.cached));
      set("tokens-output",count(tok.billed_output));set("tokens-hidden",count(tok.hidden_output));
      const bar=$("token-bar");bar.replaceChildren();
      const pieces=[["uncached",tok.uncached],["cached",tok.cached],["output",tok.billed_output]];
      const tokenTotal=pieces.reduce((acc,p)=>acc+p[1],0);
      for(const [label,value] of pieces){
        const seg=element("div",label);
        seg.style.width=(tokenTotal?value/tokenTotal*100:0).toFixed(3)+"%";
        seg.title=label+": "+count(value)+" tokens";
        bar.append(seg);
      }
      set("cost-api",money(portfolio.per_task_api_equivalent));
      set("cost-infra",money(portfolio.monthly_infrastructure/pt));
      set("cost-ops",money(portfolio.monthly_operations/pt));
      set("cost-tools",cfg.extraToolCost===null?"Unpriced":money(cfg.extraToolCost));
      set("cost-total",money(included));
      const ranges=core.sensitivity(data,mainProvider,profile,{...cfg,paid:false});
      set("cost-low",money(ranges.optimistic));
      set("cost-base",money(ranges.baseline));
      set("cost-high",money(ranges.conservative));
      set("personal-tasks",count(pt));
      set("personal-calls",count(result.calls*pt));
      set("personal-paid-label",accessMode==="api"?"Estimated API bill":"Subscription payments");
      set("personal-subscription",money(portfolio.monthly_payment));
      set("personal-api",money(portfolio.monthly_api_equivalent));
      set("personal-cost",money(portfolio.monthly_included_cost));
      set("personal-margin",money(portfolio.api_retail_less_payment));
      set("rail-data-status","Research baseline "+data.reviewed_at);
      renderAccess();
      if(step==="scale")renderScale();
    }catch(err){
      logError("Recalculation: "+String(err.message||err));
      set("side-total","Check selections");
      set("access-breakdown-heading","Choose at least one plan to calculate");
    }
  }
  function initProviderSelect(){
    for(const p of data.providers){
      const option=element("option","",p.name+" · "+p.model_name);
      option.value=p.id;$("api-provider").append(option);
      const company=element("option","",p.name);
      company.value=p.id;$("macro-provider").append(company);
    }
  }

  function initAccess(){
    const parent=$("subscription-selections");parent.replaceChildren();
    for(const provider of data.providers){
      const pref=planPrefs[provider.id]||{enabled:false,id:"",weight:0};
      const row=element("div","access-plan-row");row.dataset.provider=provider.id;
      const checkedLabel=element("label","enable-plan");
      const check=element("input");check.type="checkbox";check.id="access-enabled-"+provider.id;
      check.checked=pref.enabled;
      checkedLabel.append(check,element("span","",provider.name));
      const planLabel=element("label","", "Plan");
      const select=element("select");select.id="access-plan-"+provider.id;
      for(const p of data.access.plans.filter(p=>p.provider_id===provider.id)){
        const option=element("option","",p.name+" · "+money(p.monthly_usd)+"/mo");
        option.value=p.id;select.append(option);
      }
      select.value=pref.id||select.options[0].value;
      planLabel.append(select);
      const weightLabel=element("label","", "Work share (weight)");
      const input=element("input");input.type="number";input.id="access-weight-"+provider.id;
      input.min="0";input.max="100";input.step="5";input.value=String(pref.weight);
      weightLabel.append(input);
      row.append(checkedLabel,planLabel,weightLabel);
      parent.append(row);
      const sync=()=>{
        row.classList.toggle("active",check.checked);
        select.disabled=!check.checked;input.disabled=!check.checked;
        recalc();
      };
      check.addEventListener("change",sync);
      select.addEventListener("change",recalc);
      input.addEventListener("input",recalc);
      sync();
    }
    $("api-provider").value="openai";
    setAccessMode("subscription");
  }

  function setAccessMode(mode){
    accessMode=mode==="api"?"api":"subscription";
    $("subscriptions-access").hidden=accessMode!=="subscription";
    $("api-access").hidden=accessMode!=="api";
    for(const [id,active] of [["mode-subscriptions",accessMode==="subscription"],
                              ["mode-api",accessMode==="api"]]){
      $(id).classList.toggle("selected",active);
      $(id).setAttribute("aria-pressed",String(active));
    }
    recalc();
  }

  function currentAccessSelections(){
    const list=[];
    for(const provider of data.providers){
      if($("access-enabled-"+provider.id).checked){
        list.push({plan_id:$("access-plan-"+provider.id).value,
          weight:number("access-weight-"+provider.id)});
      }
    }
    return list;
  }

  function renderAccess(){
    if(!portfolio)return;
    set("access-breakdown-heading",accessMode==="api"
      ?"API pay-as-you-go comparison":"Your subscription economics");
    set("access-paid-label",accessMode==="api"
      ?"What the API would bill":"Total subscription payments");
    set("access-monthly-paid",money(portfolio.monthly_payment));
    set("access-api-value",money(portfolio.monthly_api_equivalent));
    set("access-serving",money(portfolio.monthly_serving));
    set("access-retail-gap",money(portfolio.api_retail_less_payment));
    set("cost-value-status",accessMode==="api"
      ?"Under API billing, the modeled token bill is paid per use; the provider may still incur separate internal costs. The gap here does not represent an additional user benefit."
      :"For "+money(portfolio.monthly_payment)+" in monthly subscription fees, this example's workload would have a published API-retail equivalent of "+money(portfolio.monthly_api_equivalent)+". The difference is not guaranteed plan savings, usage entitlement, or provider loss.");
    const root=$("access-comparison");root.replaceChildren();
    for(const r of portfolio.rows){
      const line=element("div","sub-result");
      const label=element("span");label.append(element("strong","",r.label),
        element("small","",count(r.tasks_month)+" tasks/month · "+(r.share*100).toFixed(1)+"% of work"));
      function value(lbl,v){
        const part=element("span","sub-value");
        part.append(element("small","",lbl),document.createTextNode(money(v)));
        return part;
      }
      line.append(label,value("You pay / mo",r.payment_month),
        value("API equivalent",r.api_equivalent_month),value("Modeled serving",r.serving_month));
      root.append(line);
    }
  }

  function initMacro(){
    for(const p of samples.filter(w=>w.id!=="custom")){
      const opt=element("option","",p.name);opt.value=p.id;
      $("macro-api-profile").append(opt);
    }
    macroDefaults();
  }

  function populateMacroTiers(providerId){
    const root=$("macro-tier-rows");root.replaceChildren();
    const prior=data.macro.profiles[providerId];
    const paidDefault={openai:"openai-plus",anthropic:"anthropic-pro",google:"google-pro"}[providerId];
    const base=data.access.plans.filter(p=>p.provider_id===providerId);
    for(const plan of base){
      const isFree=plan.monthly_usd===0;
      const isMainPaid=plan.id===paidDefault;
      const defaultUsers=isFree?prior.free_users:isMainPaid?prior.paid_users:0;
      const defaultRate=isFree?prior.free_tasks_per_user:prior.paid_tasks_per_user;
      const profileId=isFree?prior.free_profile:prior.paid_profile;
      const row=element("div","tier-editor");row.dataset.plan=plan.id;
      const head=element("div");head.append(element("h4","",plan.name),
        element("span","price-caption",money(plan.monthly_usd)+"/user/month"));
      const usersLabel=element("label","", "Users");
      const users=element("input");users.type="number";users.min="0";users.max="1000000000";
      users.step="1000";users.value=String(defaultUsers);users.id="macro-users-"+plan.id;
      usersLabel.append(users);
      const rateLabel=element("label","", "Tasks / user / month");
      const rate=element("input");rate.type="number";rate.min="0";rate.max="10000";
      rate.step="1";rate.value=String(defaultRate);rate.id="macro-rate-"+plan.id;
      rateLabel.append(rate);
      const profileLabel=element("label","", "Typical task");
      const select=element("select");select.id="macro-profile-"+plan.id;
      for(const sample of samples.filter(w=>w.id!=="custom")){
        const option=element("option","",sample.name);
        option.value=sample.id;select.append(option);
      }
      select.value=profileId;
      profileLabel.append(select);
      row.append(head,usersLabel,rateLabel,profileLabel);
      root.append(row);
      for(const control of [users,rate,select]){
        control.addEventListener("input",renderScale);
        control.addEventListener("change",renderScale);
      }
    }
  }

  function macroDefaults(){
    const id=$("macro-provider").value;
    const d=data.macro.profiles[id];
    if(!d)return;
    populateMacroTiers(id);
    const tasksPer=25;
    const fields={
      "macro-api-customers":Math.ceil(d.api_tasks_per_month/tasksPer),
      "macro-api-tasks-per-customer":tasksPer,
      "macro-api-profile":d.api_profile,
      "macro-api-realization":d.api_realization*100,
      "macro-ad-arpu":d.ad_usd_per_free_user_month,
      "macro-other-annual":d.additional_annual_expense_usd,
      "macro-reserve":20,
      "macro-cost-basis":"usage"
    };
    for(const [key,v] of Object.entries(fields))$(key).value=v;
    renderScale();
  }

  function macroConfig(){
    const provider=$("macro-provider").value;
    const plans=data.access.plans.filter(p=>p.provider_id===provider);
    return {
      provider_id:provider,ownership:$("macro-ownership").value,
      cost_basis:$("macro-cost-basis").value,
      reserve_fraction:number("macro-reserve")/100,
      tiers:plans.map(p=>({
        plan_id:p.id,
        users:number("macro-users-"+p.id),
        tasks_per_user:number("macro-rate-"+p.id),
        profile_id:$("macro-profile-"+p.id).value
      })),
      api_customers:number("macro-api-customers"),
      api_tasks_per_customer:number("macro-api-tasks-per-customer"),
      api_profile_id:$("macro-api-profile").value,
      api_realization:number("macro-api-realization")/100,
      ad_usd_per_free_user_month:number("macro-ad-arpu"),
      additional_annual_expense_usd:number("macro-other-annual"),
      assumptions:settings().assumptions
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
        const cfg=macroConfig();
        macroResult=core.macroByTier(data,data.access,samples,cfg);
        const p=macroResult[period];
        set("macro-revenue",money(p.revenue));
        set("macro-total-expense",money(p.total_expense));
        set("macro-infra",money(p.infrastructure));
        set("macro-ops",money(p.operations));
        set("macro-extra",p.other_expense===0?"Not modeled":money(p.other_expense));
        set("macro-balance",money(p.estimated_balance));
        set("macro-tasks",count(macroResult.total_tasks_month));
        set("macro-calls",count(macroResult.model_calls_month));
        set("macro-nodes",count(macroResult.estimated_gpu_systems.toFixed(2)));
        set("macro-provisioned",count(macroResult.provisioned_gpu_systems));
        const ratio=macroResult.revenue_to_expense_ratio;
        set("macro-coverage",ratio===null?"n/a":(100*ratio).toFixed(0)+"%");
        $("macro-coverage-fill").style.width=ratio===null?"0%":(100*Math.min(1,ratio)).toFixed(1)+"%";
        set("macro-coverage-note",ratio===null
          ?"No modeled expenses were included, so revenue coverage is undefined."
          :ratio<1
            ?"Illustrative revenue covers "+(100*ratio).toFixed(1)+"% of included modeled expense; the remaining gap is "+money(-p.estimated_balance)+"."
            :"Illustrative revenue exceeds included modeled expense by "+money(p.estimated_balance)+". This does not establish actual profit; training and other real expenses may be missing.");
        const segment=$("macro-segment-results");segment.replaceChildren();
        const fraction=period==="day"?12/365.25:period==="year"?12:1;
        for(const item of macroResult.tier_rows){
          if(item.users===0&&item.tasks_month===0)continue;
          const entry=element("div","segment-item");
          const title=element("strong","",item.name);
          const revenue=element("span");revenue.append(element("small","", "Gross revenue"),document.createTextNode(money(item.revenue*fraction)));
          const cost=element("span");cost.append(element("small","", "Usage-allocated serving"),document.createTextNode(money(item.serving*fraction)));
          entry.append(title,revenue,cost);
          segment.append(entry);
        }
        if(!segment.children.length)segment.append(element("div","info-card","No user segments have been assigned."));
      }catch(err){
        logError("Macro: "+String(err.message||err));
        set("macro-revenue","Check inputs");
      }
    }
    document.querySelectorAll(".period").forEach(button=>{
      const active=button.dataset.period===period;
      button.classList.toggle("selected",active);
      button.setAttribute("aria-pressed",String(active));
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
      estimated_costs:result?{per_task_model_serving:result.total,
        external_tools_user_supplied:result.tool_cost,
        per_task_included_total:result.task_total_if_specified,
        api_retail:result.api,monthly_model_serving:result.monthly_serving}:null,
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
      "External tool cost: "+(result.tool_cost===null?"unpriced":money(result.tool_cost)),
      "Included subtotal: "+money(result.task_total_if_specified===null
        ?result.total:result.task_total_if_specified),
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
      "cache","reasoning","extra-tool-cost","gpu_effective_tokens_s","utilization","fleet_nodes",
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
