/* Offline Node tests; no network and no API keys. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const core = require("../site/core.js");
const catalog = JSON.parse(fs.readFileSync(path.join(__dirname,"..","research","catalog.json"),"utf8"));
const examples = JSON.parse(fs.readFileSync(path.join(__dirname,"..","research","workloads.json"),"utf8")).examples;
const macroCatalog = JSON.parse(fs.readFileSync(path.join(__dirname,"..","research","macro.json"),"utf8"));
const byId = (id) => examples.find(w=>w.id===id);
function near(a,b,tolerance=1e-7) { assert.ok(Math.abs(a-b)<=tolerance, a+" != "+b); }
const quick = core.task(catalog,"openai",byId("quick"),{paid:true,ownership:"cloud"});
const idea = core.task(catalog,"openai",byId("brainstorm"),{paid:true,ownership:"cloud"});
const code = core.task(catalog,"openai",byId("coding"),{paid:true,ownership:"cloud"});
assert.ok(quick.api < idea.api && idea.api < code.api);
assert.ok(quick.total < idea.total && idea.total < code.total);
assert.equal(quick.calls,1);
assert.equal(idea.calls,10);
assert.equal(code.calls,60);
assert.equal(code.tools,85);
assert.equal(code.tool_cost,null);
assert.equal(code.task_total_if_specified,null);
assert.equal(core.profileTotals(byId("coding")).cached,324000);
assert.equal(core.profileTotals(byId("coding")).billed_output,135000);
assert.equal(core.textTokenEstimate("abcd"),1);
assert.equal(core.textTokenEstimate(""),0);
const toolIncluded = core.task(catalog,"openai",byId("coding"),{extraToolCost:2.5});
near(toolIncluded.task_total_if_specified,code.total+2.5);
const a = core.macro(catalog,"anthropic",examples,macroCatalog.profiles.anthropic);
near(a.year.revenue,12*a.month.revenue,.01);
near(a.year.serving_cost,a.day.serving_cost*365.25,.01);
near(a.month.serving_cost,a.month.consumer_serving+a.month.api_serving,.001);
assert.ok(a.eight_gpu_systems_required>0);
const empty=Object.assign({},macroCatalog.profiles.google,
  {paid_users:0,free_users:0,api_tasks_per_month:0});
const zero=core.macro(catalog,"google",examples,empty);
assert.equal(zero.month.revenue,0);
assert.equal(zero.month.serving_cost,0);
const refPath=path.join(__dirname,"..","site","data","research.json");
if(fs.existsSync(refPath)){
  const snapshot=JSON.parse(fs.readFileSync(refPath,"utf8"));
  for(const id of ["openai","anthropic","google"]){
    const py=snapshot.sample_workload_results.quick.per_task;
    if(id==="openai"){
      near(quick.api,py.api_retail_equivalent_usd,.000001);
      near(quick.total,py.modeled_inference_subtotal_usd,.000001);
    }
    const macroJS=core.macro(catalog,id,examples,macroCatalog.profiles[id]);
    const macroPy=snapshot.sample_macro_results[id];
    near(macroJS.month.revenue,macroPy.month.gross_revenue_usd,.02);
    near(macroJS.month.serving_cost,macroPy.month.modeled_serving_usd,.5);
  }
}
console.log("AI Economics browser engine: all reference and macro tests passed");


// v0.5: subscribing to two products must not duplicate the work itself.
const access = JSON.parse(fs.readFileSync(path.join(__dirname,"..","research","access.json"),"utf8"));
assert.equal(access.plans.length,15);
const mixed=core.subscriptionPortfolio(catalog,access,byId("brainstorm"),{
  mode:"subscription",repeats:10,
  selections:[{plan_id:"openai-plus",weight:50},{plan_id:"google-pro",weight:50}]
});
near(mixed.monthly_payment,39.99);
near(mixed.rows[0].tasks_month+mixed.rows[1].tasks_month,10);
near(mixed.monthly_serving,10*core.task(catalog,"openai",byId("brainstorm"),{paid:false}).total);
const openaiOnly=core.subscriptionPortfolio(catalog,access,byId("brainstorm"),{
  mode:"subscription",repeats:10,selections:[{plan_id:"openai-plus",weight:100}]
});
near(openaiOnly.monthly_payment,20);
near(openaiOnly.total_tasks_month,mixed.total_tasks_month);
const apiBilling=core.subscriptionPortfolio(catalog,access,byId("quick"),{
  mode:"api",api_provider:"google",repeats:100
});
near(apiBilling.monthly_payment,apiBilling.monthly_api_equivalent);
assert.equal(apiBilling.rows.length,1);
assert.throws(()=>core.subscriptionPortfolio(catalog,access,byId("quick"),{
  mode:"subscription",selections:[]
}));
assert.throws(()=>core.subscriptionPortfolio(catalog,access,byId("quick"),{
  mode:"subscription",selections:[{plan_id:"openai-go"},{plan_id:"openai-plus"}]
}));

// Tier changes affect revenue, not the total work, when the audience count is unchanged.
const baseCfg={
  provider_id:"openai",ownership:"cloud",cost_basis:"usage",reserve_fraction:.2,
  tiers:[
    {plan_id:"openai-free",users:1000,tasks_per_user:10,profile_id:"quick"},
    {plan_id:"openai-plus",users:100,tasks_per_user:10,profile_id:"quick"},
    {plan_id:"openai-pro100",users:0,tasks_per_user:10,profile_id:"quick"}
  ],
  api_customers:10,api_tasks_per_customer:10,api_profile_id:"coding",
  api_realization:1,ad_usd_per_free_user_month:0,additional_annual_expense_usd:0
};
const m1=core.macroByTier(catalog,access,examples,baseCfg);
const m2=core.macroByTier(catalog,access,examples,{
  ...baseCfg,tiers:baseCfg.tiers.map(t=>({...t,
    users:t.plan_id==="openai-plus"?0:t.plan_id==="openai-pro100"?100:t.users}))
});
near(m2.month.revenue-m1.month.revenue,100*(100-20));
near(m1.month.serving_cost,m2.month.serving_cost,.001);
near(m1.year.revenue,12*m1.month.revenue,.01);
near(m1.year.serving_cost,365.25*m1.day.serving_cost,.01);
assert.ok(m1.provisioned_gpu_systems>=Math.ceil(m1.estimated_gpu_systems));
const provisioned=core.macroByTier(catalog,access,examples,{...baseCfg,cost_basis:"capacity"});
assert.ok(provisioned.month.serving_cost>=m1.month.serving_cost);
assert.ok(provisioned.month.infrastructure>0);
const mZero=core.macroByTier(catalog,access,examples,{
  ...baseCfg,tiers:baseCfg.tiers.map(t=>({...t,users:0})),api_customers:0
});
near(mZero.month.total_expense,0);
assert.equal(mZero.provisioned_gpu_systems,0);
console.log("Subscription allocations and tier-level macro scenarios: passed");
