/* Shared, dependency-free browser + Node economics engine. v0.3 */
(function (root) {
  "use strict";
  var YEAR_HOURS = 8760;
  function nonneg(n) { n = Number(n); return Number.isFinite(n) ? Math.max(0, n) : 0; }
  function num(n, fallback) { n = Number(n); return Number.isFinite(n) ? n : fallback; }
  function defaults(catalog, overrides) {
    var a = {};
    Object.keys(catalog.assumptions).forEach(function(k) {
      var s = catalog.assumptions[k];
      a[k] = Math.min(s.max,Math.max(s.min,num(overrides && overrides[k],s.value)));
    });
    return a;
  }
  function profileTotals(profile) {
    var calls = nonneg(profile.model_calls);
    var input = calls * nonneg(profile.input_tokens_per_call);
    var output = calls * nonneg(profile.visible_output_tokens_per_call);
    var cache = Math.min(1,Math.max(0,num(profile.cached_input_fraction,0)));
    var multiplier = Math.max(1,num(profile.billed_output_multiplier,1));
    var cached = input * cache;
    var billed = output * multiplier;
    return {
      turns:nonneg(profile.user_turns), calls:calls,
      tools:nonneg(profile.tool_executions),
      input:input, cached:cached, uncached:input-cached,
      visible_output:output, billed_output:billed, hidden_output:billed-output,
      cache:cache, multiplier:multiplier
    };
  }
  function unitCosts(catalog, ownership, a) {
    var r = {};
    Object.keys(catalog.references).forEach(function(k){r[k] = catalog.references[k].value;});
    var cloudAnnual = r.h100_p5_8gpu_usd_hour * YEAR_HOURS;
    var ownedAnnual = a.owned_hardware_usd / a.depreciation_years
      + a.server_avg_power_kw * r.pue * r.electricity_usd_kwh * YEAR_HOURS
      + a.owned_hardware_usd * a.facility_maintenance_fraction;
    var nodeAnnual = ownership === "owned" ? ownedAnnual : cloudAnnual;
    var operationsAnnual = a.operations_fte * a.fully_loaded_salary_usd
      * (1+a.corporate_overhead_fraction) / a.fleet_nodes;
    var capacity = a.gpu_effective_tokens_s * 3600 * YEAR_HOURS * a.utilization;
    return {per_equiv_infra: nodeAnnual/capacity,
      per_equiv_ops: operationsAnnual/capacity, annual_node:nodeAnnual,
      annual_operations_per_node:operationsAnnual,annual_capacity_equiv:capacity};
  }
  function task(catalog, providerId, profile, cfg) {
    cfg = cfg || {};
    var provider = catalog.providers.find(function(p){return p.id === providerId;});
    if (!provider) {throw new Error("Unknown provider");}
    var a = defaults(catalog,cfg.assumptions);
    var t = profileTotals(profile);
    var weighted = t.uncached*a.input_compute_weight
      +t.cached*a.cached_input_compute_weight+t.billed_output;
    var u = unitCosts(catalog,cfg.ownership || "cloud",a);
    var api = (t.uncached*provider.input_usd_m
      +t.cached*provider.cached_input_usd_m+t.billed_output*provider.output_usd_m)/1e6;
    var infra = weighted * u.per_equiv_infra;
    var ops = weighted * u.per_equiv_ops;
    var perTask = infra+ops;
    var repeats = Math.max(1,Math.min(10000,num(cfg.repeats,profile.tasks_per_month || 1)));
    var consumer = cfg.paid === false ? 0 : provider.subscription_usd_month;
    var toolOverride = cfg.extraToolCost == null ? null : nonneg(cfg.extraToolCost);
    return {
      provider: provider, tokens:t, output_equiv:weighted,
      calls:t.calls, turns:t.turns, tools:t.tools,
      api:api, infra:infra, ops:ops, total:perTask,
      tool_cost:toolOverride,
      task_total_if_specified:toolOverride == null ? null : perTask+toolOverride,
      subscription_share:consumer/repeats, subscription_month:consumer,
      repeats:repeats,
      monthly_api:api*repeats, monthly_serving:perTask*repeats,
      monthly_total_if_specified:toolOverride == null ? null : (perTask+toolOverride)*repeats,
      monthly_consumer_margin:consumer-perTask*repeats,
      monthly_api_margin:api*repeats-perTask*repeats,
      assumptions:a
    };
  }
  function sensitivity(catalog,providerId,profile,cfg) {
    var a = defaults(catalog,cfg.assumptions);
    function cost(overrides) {
      return task(catalog,providerId,profile,Object.assign({},cfg,{
        assumptions:Object.assign({},a,overrides)
      })).total;
    }
    return {
      optimistic:cost({
        gpu_effective_tokens_s:Math.min(6000,a.gpu_effective_tokens_s*1.8),
        utilization:Math.min(.85,a.utilization*1.25),
        operations_fte:Math.max(8,a.operations_fte*.6),
        fleet_nodes:Math.min(3000,a.fleet_nodes*1.5)
      }),
      baseline:cost({}),
      conservative:cost({
        gpu_effective_tokens_s:Math.max(500,a.gpu_effective_tokens_s*.5),
        utilization:Math.max(.25,a.utilization*.65),
        operations_fte:Math.min(120,a.operations_fte*1.6),
        fleet_nodes:Math.max(20,a.fleet_nodes*.7)
      })
    };
  }
  function macro(catalog,providerId,profiles,cfg) {
    cfg=cfg||{};
    var p=catalog.providers.find(function(v){return v.id===providerId;});
    if(!p) {throw new Error("Unknown provider");}
    var id = function(k) {
      var found=profiles.find(function(w){return w.id===cfg[k];});
      if(!found){throw new Error("Unknown example profile: "+cfg[k]);}
      return found;
    };
    var paidUsers=nonneg(cfg.paid_users),freeUsers=nonneg(cfg.free_users);
    var paidMonthly=nonneg(cfg.paid_tasks_per_user),freeMonthly=nonneg(cfg.free_tasks_per_user);
    var apiTasks=nonneg(cfg.api_tasks_per_month);
    var paidCount=paidUsers*paidMonthly, freeCount=freeUsers*freeMonthly;
    var common={paid:false,ownership:cfg.ownership||"cloud",assumptions:cfg.assumptions,repeats:1};
    var paidUnit=task(catalog,providerId,id("paid_profile"),common);
    var freeUnit=task(catalog,providerId,id("free_profile"),common);
    var apiUnit=task(catalog,providerId,id("api_profile"),common);
    var income={
      subscriptions: paidUsers*p.subscription_usd_month,
      advertising: freeUsers*nonneg(cfg.ad_usd_per_free_user_month),
      api: apiTasks*apiUnit.api*Math.min(1,nonneg(cfg.api_realization == null ? 1 : cfg.api_realization))
    };
    var consumerCost=paidCount*paidUnit.total+freeCount*freeUnit.total;
    var apiCost=apiTasks*apiUnit.total;
    var cost={consumer:consumerCost,api:apiCost};
    var annualCapacity = unitCosts(catalog,cfg.ownership||"cloud",defaults(catalog,cfg.assumptions)).annual_capacity_equiv;
    var monthlyEquiv = paidCount*paidUnit.output_equiv + freeCount*freeUnit.output_equiv + apiTasks*apiUnit.output_equiv;
    var systems = monthlyEquiv/(annualCapacity/12);
    var revenue=income.subscriptions+income.advertising+income.api;
    var serving=consumerCost+apiCost;
    var extraAnnual=nonneg(cfg.additional_annual_expense_usd || 0);
    var additionalMonthly=extraAnnual/12;
    var period=(factor)=>({
      subscriptions:income.subscriptions*factor,
      ads:income.advertising*factor,
      api_revenue:income.api*factor,
      revenue:revenue*factor,
      consumer_serving:consumerCost*factor,
      api_serving:apiCost*factor,
      serving_cost:serving*factor,
      other_expense:additionalMonthly*factor,
      total_expense:(serving+additionalMonthly)*factor,
      estimated_balance:(revenue-serving-additionalMonthly)*factor
    });
    return {
      paid_tasks_month:paidCount,free_tasks_month:freeCount,api_tasks_month:apiTasks,
      paid_model_calls_month:paidCount*paidUnit.calls,
      free_model_calls_month:freeCount*freeUnit.calls,
      api_model_calls_month:apiTasks*apiUnit.calls,
      total_model_calls_month:paidCount*paidUnit.calls+freeCount*freeUnit.calls+apiTasks*apiUnit.calls,
      eight_gpu_systems_required:systems,weighted_equivalent_tokens_month:monthlyEquiv,
      revenue_segments:income,serving_segments:cost,
      day:period(12/365.25),month:period(1),year:period(12),
      completeness:extraAnnual>0?"serving_plus_user_defined_other":"model_only_serving",
      note:"Illustrative population and workload mix, NOT actual provider-scale financials. Not a company P&L."
    };
  }

  function subscriptionPortfolio(catalog, planCatalog, profile, cfg) {
    /* The same monthly workload is DISTRIBUTED across chosen subscriptions,
       not charged in full to each. API is an alternative access path. */
    cfg=cfg||{};
    var totalTasks=Math.max(1,Math.min(10000,Math.round(num(cfg.repeats,profile.tasks_per_month||1))));
    var plans=planCatalog.plans||[];
    var mode=cfg.mode==="api"?"api":"subscription";
    var rows=[];
    if(mode==="api"){
      var pid=cfg.api_provider||"openai";
      var unit=task(catalog,pid,profile,{ownership:cfg.ownership,assumptions:cfg.assumptions,repeats:1,paid:false});
      rows.push({plan_id:null,provider_id:pid,label:unit.provider.name+" API",share:1,
        tasks_month:totalTasks,payment_month:unit.api*totalTasks,
        api_equivalent_month:unit.api*totalTasks,
        infra_month:unit.infra*totalTasks,ops_month:unit.ops*totalTasks,
        serving_month:unit.total*totalTasks});
    }else{
      var inputs=(cfg.selections||[]).filter(function(row){
        return plans.some(function(p){return p.id===row.plan_id;});
      });
      if(!inputs.length)throw new Error("Select at least one subscription plan");
      var seen={};
      inputs.forEach(function(sel){
        var plan=plans.find(function(p){return p.id===sel.plan_id;});
        if(seen[plan.provider_id])throw new Error("Choose at most one plan per provider");
        seen[plan.provider_id]=true;
      });
      var weightSum=inputs.reduce(function(n,row){return n+nonneg(row.weight);},0);
      inputs.forEach(function(sel){
        var plan=plans.find(function(p){return p.id===sel.plan_id;});
        var fraction=weightSum>0?nonneg(sel.weight)/weightSum:1/inputs.length;
        var unit=task(catalog,plan.provider_id,profile,{ownership:cfg.ownership,assumptions:cfg.assumptions,repeats:1,paid:false});
        rows.push({plan_id:plan.id,provider_id:plan.provider_id,label:plan.name,
          share:fraction,tasks_month:totalTasks*fraction,payment_month:plan.monthly_usd,
          api_equivalent_month:unit.api*totalTasks*fraction,
          infra_month:unit.infra*totalTasks*fraction,ops_month:unit.ops*totalTasks*fraction,
          serving_month:unit.total*totalTasks*fraction});
      });
    }
    function sum(key){return rows.reduce(function(t,row){return t+row[key];},0);}
    var tool=cfg.extraToolCost==null?null:nonneg(cfg.extraToolCost);
    var payment=sum("payment_month"),retail=sum("api_equivalent_month"),
        serving=sum("serving_month"),infra=sum("infra_month"),ops=sum("ops_month");
    return {mode:mode,rows:rows,total_tasks_month:totalTasks,
      monthly_payment:payment,monthly_api_equivalent:retail,monthly_serving:serving,
      monthly_infrastructure:infra,monthly_operations:ops,
      monthly_extra_tool_cost:tool==null?null:tool*totalTasks,
      monthly_included_cost:tool==null?serving:serving+tool*totalTasks,
      per_task_payment_allocation:payment/totalTasks,
      per_task_api_equivalent:retail/totalTasks,
      per_task_serving:serving/totalTasks,
      per_task_included_cost:serving/totalTasks+(tool||0),
      api_retail_less_payment:retail-payment,
      api_retail_to_payment:payment>0?retail/payment:null,
      payment_less_included_expense:payment-serving-(tool||0)*totalTasks,
      external_tools_unpriced:tool===null&&nonneg(profile.tool_executions)>0,
      caution:"API-equivalent retail is a counterfactual price, not a guarantee of value or actual provider cost. Subscription workloads may exceed plan usage limits."
    };
  }

  function macroByTier(catalog, planCatalog, profileCatalog, cfg) {
    /* All rows are hypothetical, mutually exclusive *accounts* in this
       simulation. There is no observed provider audience/expense telemetry. */
    cfg=cfg||{};
    var provider=catalog.providers.find(function(p){return p.id===cfg.provider_id;});
    if(!provider)throw new Error("Unknown macro provider");
    var plans=planCatalog.plans.filter(function(p){return p.provider_id===provider.id;});
    var profiles=profileCatalog.filter(function(p){return p.id!=="custom";});
    function chosen(id) {
      var p=profiles.find(function(w){return w.id===id;});
      if(!p)throw new Error("Unknown profile "+id);
      return p;
    }
    var seen={},rows=[],totalTasks=0,modelCalls=0,weighted=0;
    var subRevenue=0,adRevenue=0,apiRevenue=0;
    var allocatedInfra=0,allocatedOps=0;
    var common={ownership:cfg.ownership||"cloud",assumptions:cfg.assumptions,paid:false,repeats:1};
    (cfg.tiers||[]).forEach(function(t){
      var plan=plans.find(function(p){return p.id===t.plan_id;});
      if(!plan||seen[t.plan_id])throw new Error("Invalid or duplicate tier");
      seen[t.plan_id]=true;
      var users=Math.floor(Math.min(1e9,nonneg(t.users)));
      var tasksUser=Math.min(10000,nonneg(t.tasks_per_user));
      var unit=task(catalog,provider.id,chosen(t.profile_id),common);
      var tasks=users*tasksUser,revenue=users*plan.monthly_usd;
      var ads=plan.monthly_usd===0?users*nonneg(cfg.ad_usd_per_free_user_month):0;
      var infra=tasks*unit.infra,ops=tasks*unit.ops;
      totalTasks+=tasks;modelCalls+=tasks*unit.calls;weighted+=tasks*unit.output_equiv;
      subRevenue+=revenue;adRevenue+=ads;allocatedInfra+=infra;allocatedOps+=ops;
      rows.push({plan_id:plan.id,name:plan.name,users:users,tasks_month:tasks,
        revenue:revenue+ads,subscription_revenue:revenue,ads_revenue:ads,
        infrastructure:infra,operations:ops,serving:infra+ops});
    });
    var apiCustomers=Math.floor(Math.min(1e9,nonneg(cfg.api_customers)));
    var apiTasksUser=Math.min(10000,nonneg(cfg.api_tasks_per_customer));
    var apiTasks=apiCustomers*apiTasksUser;
    var apiUnit=task(catalog,provider.id,chosen(cfg.api_profile_id||"coding"),common);
    var realized=Math.min(1,nonneg(cfg.api_realization==null?1:cfg.api_realization));
    apiRevenue=apiTasks*apiUnit.api*realized;
    allocatedInfra+=apiTasks*apiUnit.infra;
    allocatedOps+=apiTasks*apiUnit.ops;
    weighted+=apiTasks*apiUnit.output_equiv;
    modelCalls+=apiTasks*apiUnit.calls;
    totalTasks+=apiTasks;
    rows.push({plan_id:"api",name:provider.name+" API",users:apiCustomers,tasks_month:apiTasks,
      revenue:apiRevenue,subscription_revenue:0,ads_revenue:0,
      infrastructure:apiTasks*apiUnit.infra,operations:apiTasks*apiUnit.ops,
      serving:apiTasks*apiUnit.total});
    var units=unitCosts(catalog,cfg.ownership||"cloud",defaults(catalog,cfg.assumptions));
    var nodes=weighted/(units.annual_capacity_equiv/12);
    var reserve=Math.min(1,nonneg(cfg.reserve_fraction==null?0.20:cfg.reserve_fraction));
    var provisioned=totalTasks>0?Math.max(1,Math.ceil(nodes*(1+reserve))):0;
    var basis=cfg.cost_basis==="capacity"?"capacity":"usage";
    var infrastructure=basis==="capacity"?provisioned*units.annual_node/12:allocatedInfra;
    var operations=basis==="capacity"?provisioned*units.annual_operations_per_node/12:allocatedOps;
    var other=nonneg(cfg.additional_annual_expense_usd)/12;
    var revenue=subRevenue+adRevenue+apiRevenue;
    var serving=infrastructure+operations;
    function period(factor) {
      return {subscription_revenue:subRevenue*factor,ads_revenue:adRevenue*factor,
        api_revenue:apiRevenue*factor,revenue:revenue*factor,
        infrastructure:infrastructure*factor,operations:operations*factor,
        serving_cost:serving*factor,other_expense:other*factor,
        total_expense:(serving+other)*factor,
        estimated_balance:(revenue-serving-other)*factor};
    }
    return {provider_id:provider.id,cost_basis:basis,
      tier_rows:rows,total_tasks_month:totalTasks,model_calls_month:modelCalls,
      estimated_gpu_systems:nodes,provisioned_gpu_systems:provisioned,
      capacity_reserve_fraction:reserve,
      usage_allocated_serving_month:allocatedInfra+allocatedOps,
      provisioned_fleet_month:provisioned*(units.annual_node+units.annual_operations_per_node)/12,
      day:period(12/365.25),month:period(1),year:period(12),
      revenue_to_expense_ratio:serving+other>0?revenue/(serving+other):null,
      is_actual_financials:false,
      caveat:"Hypothetical population, usage and fleet model, not observed provider financials. Provisioned capacity mode charges full modeled system-months; do not add it to usage-allocated cost."};
  }

  function textTokenEstimate(text) {
    /* Informal approximation for common English text, NOT a model tokenizer. */
    if (!text || !String(text).trim()) return 0;
    return Math.max(1,Math.ceil(Array.from(String(text)).length/4));
  }
  var api={task:task,macro:macro,subscriptionPortfolio:subscriptionPortfolio,macroByTier:macroByTier,profileTotals:profileTotals,sensitivity:sensitivity,
    defaults:defaults,unitCosts:unitCosts,textTokenEstimate:textTokenEstimate};
  if (typeof module!=="undefined" && module.exports) {module.exports=api;}
  root.AiEconomicsCore=api;
})(typeof window!=="undefined" ? window : globalThis);
