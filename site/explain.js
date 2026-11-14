/* v0.6: accessible metric explanations, token analogies and zero-dependency charts.
   Presentation only; cost mathematics stay in core.js. */
(function(root){
 "use strict";
 const definitions={
  "chosen-turns":"The number of human messages across the complete example task. A single user turn can cause several internal model calls.",
  "chosen-calls":"One inference invocation, including repeated prompts/context. A multi-step coding agent may call a model many times for one visible request.",
  "chosen-tools":"Separate shell, browser, search, file, test or deployment actions triggered during the task. Their costs are not automatically known.",
  "model-calls":"Each model call processes its own input and generates output. Multiply the average per-call token estimates by the number of calls to get the whole task. Do not confuse calls with user messages.",
  "repeats":"How many times you complete the entire selected task in one month. A subscription is paid once per plan, while API and modeled serving usage scale with this quantity.",
  "input":"Average tokens a model receives on EACH call: user prompt, system instructions, conversation history, retrieved documents and tool results. Multiply by model calls to get task input. Example analogies use rough English-text equivalents.",
  "output":"Average visible tokens the model generates on EACH call. Hidden reasoning or other billable output is estimated separately through the output multiplier.",
  "cache":"Percent of modeled input tokens read from a prompt cache rather than processed at full input price. Actual caching availability, thresholds and rates vary by API.",
  "reasoning":"Additional estimated billable output, relative to visible output: 1.0 means no extra hidden output; 2.0 means twice the visible count is billed. This is a scenario, not measured model reasoning.",
  "question-text":"A sample prompt pasted for estimating visible text size only. It stays in your browser, is not sent to purgatory01 and is excluded from diagnostics.",
  "answer-text":"A sample answer pasted to estimate generated visible output. Exact tokenization depends on the model, language, formatting and coding syntax.",
  "context-tokens":"An allowance for instructions, conversation history and other material omitted from your pasted prompt. It is a manual assumption, not recovered provider context.",
  "token-unit":"Choose a familiar quantity of text. Each token is approximated as 0.75 English words; literature references are rough and vary with edition or translation.",
  "api-provider":"Select which provider's published text-token API rates are used for pay-as-you-go billing. Consumer subscriptions do not automatically pay API bills.",
  "ownership":"Compare renting eight-H100 cloud capacity (rental includes facilities and power) versus modeled owned hardware (depreciation, power, maintenance). Neither is a provider's measured server bill.",
  "extra-tool-cost":"Optional extra dollars spent per completed task on external tools, cloud sandboxes, CI, deployment, media or other systems. Leave blank when unknown: blank means UNPRICED, not free.",
  "gpu_effective_tokens_s":"Assumed output-equivalent tokens processed per second by a full eight-GPU node. A hypothetical capacity proxy; not a benchmark of the chosen proprietary model.",
  "utilization":"Fraction of the node's theoretical annual capacity that the model assumes is productively used. Lower utilization raises each task's allocated infrastructure cost.",
  "fleet_nodes":"Hypothetical number of eight-GPU servers sharing the modeled operations team. This is not the number of actual systems operated by a named company.",
  "operations_fte":"Hypothetical full-time-equivalent staff supporting this server fleet. Their cost is spread across servers and then across modeled tasks.",
  "fully_loaded_salary_usd":"Assumed annual compensation plus benefits/payroll costs per operations staff member. A scenario, not the provider's actual personnel expenses.",
  "corporate_overhead_fraction":"Extra administration applied on top of modeled labor spending. This is only a partial allocation, not an audited corporate P&L.",
  "macro-provider":"Provider whose published individual subscription prices and API rates define this hypothetical company's revenue model. Population inputs are fictional.",
  "macro-ownership":"Choose cloud rental or owned hardware accounting in this hypothetical company-scale expense calculation.",
  "macro-cost-basis":"Usage-allocated prices only consumed modeled capacity. Provisioned-fleet instead charges whole eight-GPU system-months plus reserve capacity. Do not add the two modes together.",
  "macro-reserve":"Extra provisioned systems beyond average token-capacity demand, represented as a percent. Does not guarantee peak-latency performance or include all redundancy.",
  "macro-api-customers":"Assumed distinct business API customers for the simulated provider, separate from consumer plan accounts to avoid double-counting populations.",
  "macro-api-tasks-per-customer":"Completed representative API tasks each hypothetical business customer generates in a month, NOT total model calls.",
  "macro-api-profile":"Representative task shape used to estimate API customer tokens, charges and compute cost.",
  "macro-api-realization":"Percent of published retail token charges assumed to be collected. Use this to illustrate pricing discounts or commercial arrangements; no actual discounts are known.",
  "macro-ad-arpu":"Extra hypothetical monthly advertising revenue from EACH free-tier account. Defaults to zero as unestimated, not as a claim a provider earns no advertising.",
  "macro-other-annual":"Optional yearly business expenses such as training, sales, research or marketing. Unknown categories remain unpriced; some inputs can double-count modeled operations.",
  "access-monthly-paid":"Fixed monthly consumer plan fees added once for each selected plan; in API mode the estimated usage bill. Does not account for taxes, credits or promotions.",
  "access-api-value":"Alternative price of the SAME modeled workload at the selected providers' published text API rates. This is not an internal cost, guaranteed subscription entitlement or observed value.",
  "access-serving":"Modeled infrastructure and support cost to serve the workload, independent of consumer list pricing. Hardware throughput and staffing are hypothetical.",
  "access-retail-gap":"Published API retail-equivalent minus what you pay. Positive indicates a higher alternative retail price, NOT a measured provider subsidy or profit.",
  "tokens-input":"All input tokens across ALL model calls for one task. Includes cached input; cached input is a subset of this total and must not be added again.",
  "tokens-cached":"Part of total input assumed served through caching. Do not add it to total input or the count will be inflated.",
  "tokens-output":"Total billable output across model calls, including the extra output multiplier. May be greater than visible answer text.",
  "tokens-hidden":"Billable output allowance above visible text, e.g. hypothetical hidden reasoning. Not an observation of internal model processing.",
  "cost-api":"Equivalent public token API charge per completed task. Chosen access plans and task distribution affect the result.",
  "cost-infra":"Per-task allocation of eight-GPU infrastructure expense under the selected rented/owned scenario. Input tokens use lower output-equivalent compute weights.",
  "cost-ops":"Staffing and administrative overhead allocated from a hypothetical fleet to this task. Excludes many real corporate functions.",
  "cost-tools":"Only included if you enter a dollar amount for external tool execution. Unknown tool costs remain unpriced.",
  "cost-total":"Modeled infrastructure plus operations and any explicitly entered outside-tool expense per completed task. This is not what a provider actually spends.",
  "cost-low":"Optimistic cost sensitivity if the assumed fleet is more efficient. It is not a statistical confidence bound.",
  "cost-base":"Serving expense under the user-selected base assumptions, excluding any unpriced outside tools.",
  "cost-high":"Conservative sensitivity with lower throughput/utilization or higher staffing allocations. Not a statistically derived maximum.",
  "personal-tasks":"Total complete tasks in the simulated month. With multiple subscriptions these tasks are DISTRIBUTED by weighted share, not duplicated.",
  "personal-calls":"Total model invocations in the monthly example: calls per complete task × completed tasks per month.",
  "personal-subscription":"Your modeled fixed subscription payments for selected plans, or your estimated usage-based API bill in API mode.",
  "personal-api":"What the same month's text workload would cost using published API list prices, weighted by provider share.",
  "personal-cost":"Modeled monthly GPU and operations expense plus only explicitly entered outside-tool costs. It is not the provider's measured cost.",
  "personal-margin":"API retail minus the amount you pay. This is a consumer retail-comparison gap, NOT provider profit or the amount of usage your plan guarantees.",
  "personal-monthly-tokens":"Task input plus billable output multiplied by the number of completed tasks in a month. Cached input is already inside input and is not counted twice.",
  "macro-revenue":"Sum of hypothetical subscriptions, assumed ads from free-tier accounts, and realized API billings for this selected period.",
  "macro-total-expense":"Selected infrastructure cost basis plus assumed operating staff/admin and any additional company spending you explicitly entered.",
  "macro-infra":"GPU/cloud rental allocation or owned-equipment depreciation, power and maintenance under the chosen cost method. Not training cost.",
  "macro-ops":"Hypothetical supporting staff and administration. A partial allocation that excludes other company functions.",
  "macro-extra":"User-entered additional business expenses. 'Not modeled' means unknown, not free.",
  "macro-balance":"Modeled revenue minus INCLUDED modeled expense. This is not net income, audited profit, cash flow or a verified company margin.",
  "macro-coverage":"Ratio of modeled revenue to included modeled expense; 100% means equal under these assumptions. Excluded real-world expense can materially alter the result.",
  "macro-tasks":"Total completed consumer and API tasks per simulated month, aggregated from tier populations.",
  "macro-calls":"Total monthly model invocations, counting multiple calls per completed task.",
  "macro-nodes":"Average eight-GPU node equivalents needed at the assumed throughput and utilization, ignoring peak demand and geographic constraints.",
  "macro-provisioned":"Whole eight-GPU systems after applying the selected spare-capacity percentage, rounded upward. Costed fully only in the provisioned-fleet approach.",
  "side-total":"Modeled infrastructure + supporting operations and any separately entered outside-tool expense for one complete task.",
  "side-api":"Published text-token API retail equivalent for one complete task, including the chosen provider mix.",
  "side-subscription":"Fixed subscriber fees or API bill allocated over completed tasks for comparison. Subscriptions do NOT charge a separate amount per question.",
  "side-calls":"Individual model invocations inside this task; one visible request may include many.",
  "side-tokens":"Total input plus billable output tokens for the completed task. Cached input is already in input, so it is not counted twice.",
  "side-tokens-analogy":"Familiar-text comparison for the task's tokens. Uses ~0.75 ordinary English words per token and rough text lengths, not a model-specific book tokenizer."
 };
 let activeHelp=null;
 function labelDefinition(id){
   if(definitions[id])return definitions[id];
   if(id.startsWith("access-enabled-"))return "Include one subscription plan for this provider. Selecting the plan adds its fixed monthly price and allows you to assign a share of the total modeled workload.";
   if(id.startsWith("access-plan-"))return "Select the active individual subscription tier. This sets the fixed monthly list price; API rates still use the provider's separate published API comparator.";
   if(id.startsWith("access-weight-"))return "This plan's weight in a shared workload. All active weights are normalized to 100%, so the same task is not double-counted across your plans.";
   if(id.startsWith("macro-users-"))return "Hypothetical accounts subscribed to this specific tier. Each user pays the tier's monthly list price unless it is a free plan.";
   if(id.startsWith("macro-rate-"))return "Average completed representative tasks per subscriber per month for this tier. It controls total server demand and inferred expense.";
   if(id.startsWith("macro-profile-"))return "Choose the representative task, whose tokens and model calls multiply across all simulated users at this tier.";
   return null;
 }
 function makeIcon(title,details){
   const b=document.createElement("button");
   b.type="button";b.className="metric-info";
   b.textContent="i";
   b.setAttribute("aria-label","Explain "+title);
   b.setAttribute("aria-haspopup","true");
   b.setAttribute("aria-expanded","false");
   b.title="Explain "+title;
   b.addEventListener("click",e=>{
     e.preventDefault();e.stopPropagation();toggleHelp(b,title,details);
   });
   return b;
 }
 function closeHelp(){
   const tip=document.getElementById("metric-help-tooltip");
   if(tip)tip.hidden=true;
   if(activeHelp){activeHelp.setAttribute("aria-expanded","false");activeHelp=null;}
 }
 function toggleHelp(button,title,detail){
   if(activeHelp===button){closeHelp();return;}
   closeHelp();
   const tip=document.getElementById("metric-help-tooltip");
   if(!tip)return;
   tip.replaceChildren();
   const heading=document.createElement("strong");heading.textContent=title;
   const body=document.createElement("p");body.textContent=detail;
   tip.append(heading,body);tip.hidden=false;
   button.setAttribute("aria-expanded","true");
   activeHelp=button;
   const r=button.getBoundingClientRect();
   const width=Math.min(340,window.innerWidth-24);
   tip.style.width=width+"px";
   const left=Math.max(12,Math.min(window.innerWidth-width-12,r.left));
   tip.style.left=left+"px";
   const h=tip.getBoundingClientRect().height;
   const below=r.bottom+10,above=r.top-h-10;
   tip.style.top=(below+h<window.innerHeight-12?below:Math.max(12,above))+"px";
 }
 function initHelp(){
   if(!document.getElementById("metric-help-tooltip")){
     const tip=document.createElement("div");tip.id="metric-help-tooltip";
     tip.className="metric-help-tooltip";tip.setAttribute("role","tooltip");
     tip.hidden=true;document.body.append(tip);
     document.addEventListener("click",e=>{
       if(activeHelp&&!activeHelp.contains(e.target)&&!tip.contains(e.target))closeHelp();
     });
     document.addEventListener("keydown",e=>{if(e.key==="Escape")closeHelp();});
     window.addEventListener("resize",closeHelp);
     document.getElementById("stage-scroll").addEventListener("scroll",closeHelp,{passive:true});
   }
   decorate();
 }
 function decorate(){
   // Put icon directly next to every editable field caption, not below it.
   document.querySelectorAll(".screen label, .token-reference label").forEach(label=>{
     if(label.dataset.helpAttached)return;
     const control=label.querySelector("input,select,textarea")||
       (label.htmlFor?document.getElementById(label.htmlFor):null);
     if(!control)return;
     const info=labelDefinition(control.id);
     if(!info)return;
     const explicit=[...label.childNodes].find(node=>
       node.nodeType===Node.TEXT_NODE&&node.textContent.trim());
     let anchor=null,title="";
     if(explicit){
       title=explicit.textContent.trim();
       const header=document.createElement("span");header.className="field-heading";
       const caption=document.createElement("span");caption.textContent=title;
       header.append(caption,makeIcon(title,info));
       explicit.replaceWith(header);anchor=header;
     }else if(label.classList.contains("enable-plan")){
       anchor=label.querySelector("span");
       if(anchor){title=anchor.textContent.trim();anchor.append(makeIcon(title,info));}
     }
     if(anchor)label.dataset.helpAttached="true";
   });
   // Read-only metric cards: attach compact i icon to the existing title.
   for(const [id,info] of Object.entries(definitions)){
     const value=document.getElementById(id);
     if(!value||value.dataset.helpAttached||value.matches("input,select,textarea"))continue;
     let textNode;
     if(id==="side-total")textNode=value.parentElement.querySelector(".metric-title");
     else if(id==="macro-coverage")textNode=value.parentElement.querySelector("h3");
     else if(id.startsWith("cost-"))textNode=value.parentElement.querySelector(":scope > span");
     else if(id==="side-tokens-analogy")textNode=value.closest(".token-reference")?.querySelector("label");
     else textNode=value.parentElement.querySelector("small,span");
     if(!textNode||textNode===value)continue;
     let name=textNode.childNodes[0]?.textContent?.trim()||id.replace(/-/g," ");
     if(id.startsWith("cost-")){
       const desc=textNode.querySelector("small");
       if(desc)desc.remove();
       name=textNode.textContent.trim();
     }
     textNode.append(makeIcon(name,info));
     value.dataset.helpAttached="true";
   }
 }
 function byToken(tokens,selected){
   const unit=root.AiEconomicsUnits;
   return unit?unit.amount(tokens,selected):null;
 }
 function renderTokens(tokens,perCall,repeats){
   const unitId=document.getElementById("token-unit").value;
   const unit=root.AiEconomicsUnits;
   if(!unit)return;
   const show=(id,n,prefix="≈ ")=>{
     const v=byToken(n,unitId);
     const node=document.getElementById(id);
     if(node)node.textContent=v?prefix+v.label:"—";
   };
   show("side-tokens-analogy",tokens.input+tokens.billed_output);
   show("tokens-input-analogy",tokens.input);
   show("tokens-cached-analogy",tokens.cached);
   show("tokens-output-analogy",tokens.billed_output);
   show("tokens-hidden-analogy",tokens.hidden_output);
   show("input-token-analogy",perCall.input_tokens_per_call);
   show("output-token-analogy",perCall.visible_output_tokens_per_call);
   show("context-tokens-analogy",Number(document.getElementById("context-tokens").value)||0);
   const monthly=(tokens.input+tokens.billed_output)*repeats;
   const monthlyNode=document.getElementById("personal-monthly-tokens");
   if(monthlyNode)monthlyNode.textContent=new Intl.NumberFormat("en-US",{maximumFractionDigits:0}).format(monthly)+" tokens";
   show("personal-monthly-analogy",monthly);
   const reference=unit.byId(unitId);
   const note=document.getElementById("token-unit-note");
   if(note)note.textContent=reference.note+" Counts are approximate; exact tokens vary by model, translation and text.";
   const side=document.getElementById("side-tokens");
   if(side)side.setAttribute("aria-label",new Intl.NumberFormat("en-US").format(tokens.input+tokens.billed_output)+" tokens, approximately "+byToken(tokens.input+tokens.billed_output,unitId).label);
 }
 function item(tag,cls,content){
   const e=document.createElement(tag);if(cls)e.className=cls;
   if(content!==undefined)e.textContent=String(content);return e;
 }
 function drawRows(target,rows,money){
   const max=Math.max(0.00000001,...rows.map(r=>Math.max(0,r.total)));
   const rootEl=document.getElementById(target);rootEl.replaceChildren();
   for(const row of rows){
     const wrapper=item("div","compare-row");
     const heading=item("div","compare-row-head");
     heading.append(item("span","compare-row-label",row.label),
       item("strong","compare-row-total",money(row.total)));
     const track=item("div","compare-track");
     track.setAttribute("role","presentation");
     const width=row.total>0?row.total/max*100:0;
     if(row.parts){
       const fit=item("div","compare-bar-group");
       fit.style.width=width+"%";if(width>0)fit.style.minWidth="2px";
       const totalParts=row.parts.reduce((sum,p)=>sum+Math.max(0,p.value),0);
       for(const part of row.parts){
         const el=item("div","compare-fill "+part.color);
         el.style.width=(totalParts>0?Math.max(0,part.value)/totalParts*100:0)+"%";
         el.title=part.label+": "+money(part.value);
         fit.append(el);
       }
       track.append(fit);
     }else{
       const fill=item("div","compare-fill "+row.color);
       fill.style.width=width+"%";if(width>0)fill.style.minWidth="2px";
       track.append(fill);
     }
     wrapper.append(heading,track);rootEl.append(wrapper);
   }
   rootEl.setAttribute("aria-label",rows.map(r=>r.label+" "+money(r.total)).join("; "));
 }
 function personal(portfolio,money,mode){
   if(!portfolio)return;
   const payment=portfolio.monthly_payment,
     retail=portfolio.monthly_api_equivalent,
     expense=portfolio.monthly_included_cost;
   drawRows("personal-comparison-chart",[
     {label:mode==="api"?"Your estimated API bill":"Subscription payments",total:payment,color:"bar-payment"},
     {label:"Same workload at public API rates",total:retail,color:"bar-retail"},
     {label:"Included modeled serving + entered tools",total:expense,color:"bar-expense"}
   ],money);
   const description=document.getElementById("personal-chart-explanation");
   if(mode==="api"){
     description.textContent="In API mode, your estimated billed amount and public API equivalent are the SAME price basis. The separate serving-cost line is a hypothetical provider-side expense, not an additional bill to you.";
   }else if(payment===0){
     description.textContent="No paid subscription is selected. The task still has modeled serving cost; available free-tier usage may be limited.";
   }else if(retail>payment){
     description.textContent="The modeled workload has "+(retail/payment).toFixed(1)+"× the published API retail equivalent of your fixed plan payments. That is a counterfactual retail comparison, NOT guaranteed plan savings or provider subsidy.";
   }else{
     description.textContent="At this workload volume, public API retail is "+(retail/payment*100).toFixed(1)+"% of your fixed subscription payments. This comparison excludes the plans' other benefits and any usage caps.";
   }
 }
 function company(p,money,period){
   if(!p)return;
   drawRows("company-comparison-chart",[
     {label:"Illustrative revenue",total:p.revenue,parts:[
       {label:"Subscriptions",value:p.subscription_revenue,color:"bar-subscriptions"},
       {label:"Assumed advertising",value:p.ads_revenue,color:"bar-ads"},
       {label:"API billing",value:p.api_revenue,color:"bar-api"}
     ]},
     {label:"Included modeled expense",total:p.total_expense,parts:[
       {label:"Infrastructure",value:p.infrastructure,color:"bar-infrastructure"},
       {label:"Supporting operations",value:p.operations,color:"bar-operations"},
       {label:"Additional allowance",value:p.other_expense,color:"bar-extra"}
     ]}
   ],money);
   const legend=document.getElementById("company-chart-legend");
   legend.replaceChildren();
   for(const [name,color] of [["Subscriptions","bar-subscriptions"],
     ["Advertising (assumed)","bar-ads"],["API revenue","bar-api"],
     ["GPU infrastructure","bar-infrastructure"],["Operations","bar-operations"],
     ["Other entered expense","bar-extra"]]){
     const line=item("span","chart-legend-item");
     line.append(item("i","chart-key "+color),document.createTextNode(name));
     legend.append(line);
   }
   document.getElementById("company-comparison-chart").dataset.period=period;
 }
 const api={definitions,initHelp,decorate,closeHelp,renderTokens,personal,company};
 if(typeof module!=="undefined"&&module.exports)module.exports=api;
 root.AiEconomicsExplain=api;
})(typeof window!=="undefined"?window:globalThis);
