/* v0.6: deliberately approximate English-text scale comparisons.
   These are illustrative word-equivalents, not measured model-tokenized copies
   of a given book. Translation, edition, language and model can change counts.
   English token heuristic: 1 token ≈ 0.75 words.
   Reference: https://help.openai.com/en/articles/4936856-understanding-and-counting-tokens */
(function(root){
  "use strict";
  const ENGLISH_WORDS_PER_TOKEN=0.75;
  const units=[
    {id:"words",label:"English words",wordCount:1,singular:"English word",plural:"English words",
      note:"The default rough rule is 100 tokens ≈ 75 English words.",source:"https://help.openai.com/en/articles/4936856-understanding-and-counting-tokens"},
    {id:"pages",label:"Printed pages",wordCount:250,singular:"printed page",plural:"printed pages",
      note:"A 250-word prose page is an illustrative reference, not a specific published layout.",source:null},
    {id:"articles",label:"Short articles",wordCount:1000,singular:"1,000-word article",plural:"1,000-word articles",
      note:"A generic article of 1,000 words; actual articles vary widely.",source:null},
    {id:"novels",label:"Typical novels",wordCount:80000,singular:"80,000-word novel",plural:"80,000-word novels",
      note:"Illustrative novel length, not the mean of all published novels.",source:null},
    {id:"odyssey",label:"Homer's Odyssey",wordCount:120000,singular:"copy of The Odyssey",plural:"copies of The Odyssey",
      note:"About 120,000 words in the original Greek according to Penguin; English translation varies. English-token conversion is an intentionally rough comparison.",source:"https://www.penguin.co.uk/discover/articles/the-odyssey-homer-guide-summary-characters-best-version-translation"},
    {id:"warpeace",label:"War and Peace",wordCount:566513,singular:"copy of War and Peace",plural:"copies of War and Peace",
      note:"English translation word count from a Project Gutenberg edition; editions differ.",source:"https://vocabularybuilding.org/words-in/war-and-peace/"}
  ];
  const fmt=new Intl.NumberFormat("en-US",{maximumFractionDigits:0});
  function shortNumber(n){
    if(n>=1e9)return (n/1e9).toFixed(2)+"B";
    if(n>=1e6)return (n/1e6).toFixed(2)+"M";
    if(n>=1e4)return fmt.format(Math.round(n));
    if(n>=10)return n.toFixed(n<100?1:0).replace(/\.0$/,"");
    if(n>=1)return n.toFixed(n<10?2:1).replace(/0+$/,"").replace(/\.$/,"");
    if(n>=.01)return n.toFixed(3).replace(/0+$/,"").replace(/\.$/,"");
    if(n>0)return n.toPrecision(2);
    return "0";
  }
  function byId(id){return units.find(u=>u.id===id)||units[0];}
  function amount(tokens,id){
    const value=Number(tokens);
    if(!Number.isFinite(value)||value<0)return null;
    const unit=byId(id),equivalentWords=value*ENGLISH_WORDS_PER_TOKEN;
    return {tokens:value,approxWords:equivalentWords,
      equivalents:equivalentWords/unit.wordCount,
      unit:unit,label:shortNumber(equivalentWords/unit.wordCount)+
       " "+(Math.abs(equivalentWords/unit.wordCount-1)<.0001?unit.singular:unit.plural)};
  }
  if(typeof module!=="undefined"&&module.exports)module.exports={units,amount,byId,ENGLISH_WORDS_PER_TOKEN};
  root.AiEconomicsUnits={units,amount,byId,ENGLISH_WORDS_PER_TOKEN};
})(typeof window!=="undefined"?window:globalThis);
