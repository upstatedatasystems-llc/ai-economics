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
