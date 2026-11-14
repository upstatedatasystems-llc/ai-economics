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
      revenue_segments:income,serving_segments:cost,
      day:period(12/365.25),month:period(1),year:period(12),
      completeness:extraAnnual>0?"serving_plus_user_defined_other":"model_only_serving",
      note:"Illustrative population and workload mix, NOT actual provider-scale financials. Not a company P&L."
    };
  }
  function textTokenEstimate(text) {
    /* Informal approximation for common English text, NOT a model tokenizer. */
    if (!text || !String(text).trim()) return 0;
    return Math.max(1,Math.ceil(Array.from(String(text)).length/4));
  }
  var api={task:task,macro:macro,profileTotals:profileTotals,sensitivity:sensitivity,
    defaults:defaults,unitCosts:unitCosts,textTokenEstimate:textTokenEstimate};
  if (typeof module!=="undefined" && module.exports) {module.exports=api;}
  root.AiEconomicsCore=api;
})(typeof window!=="undefined" ? window : globalThis);
