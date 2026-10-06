// Checks the "is this word really a filler?" rules in app/index.html against
// example sentences. Run: node tests/filler-context.test.js
// It pulls fillerInContext() straight out of the page, so it tests the real code.
const fs=require('fs'); const h=fs.readFileSync(require("path").join(__dirname, "..", "app", "index.html"), "utf8");
const a=h.indexOf('  function wordSet'), b=h.indexOf('  /* before = transcript so far');
const nw=h.match(/function normWord[^\n]*/)[0];
eval(h.slice(a,b)+'\n'+nw+'\nglobalThis.F=fillerInContext; globalThis.N=normWord;');
const FILLERS=["um","uh","like","so","you know","kind of","sort of"];
// recap-style: words carry punctuation; [p] marks a hesitation before the next word
function count(sentence, recap){
  const toks=sentence.split(/\s+/); const words=[]; let gap=false;
  for(const t of toks){ if(t==='[p]'){gap=true;continue;} words.push({raw:t,n:N(t),gap}); gap=false; }
  const hits=[];
  for(let i=0;i<words.length;i++){
    for(const f of FILLERS.slice().sort((x,y)=>y.split(' ').length-x.split(' ').length)){
      const fw=f.split(' '); if(!fw.every((x,q)=>words[i+q]&&words[i+q].n===x)) continue;
      const prev=words.slice(0,i).reverse().slice(0,3).map(w=>w.n), next=words.slice(i+fw.length,i+fw.length+3).map(w=>w.n);
      const last=words[i+fw.length-1];
      const cue=recap?{start:i===0||/[.!?]$/.test(words[i-1].raw),punctBefore:i>0&&/[,;:]$/.test(words[i-1].raw),punctAfter:/[,;:]$/.test(last.raw),pauseBefore:words[i].gap,pauseAfter:!!(words[i+fw.length]&&words[i+fw.length].gap)}:{};
      if(F(f,prev,next,cue)) hits.push(f); i+=fw.length-1; break;
    }
  }
  return hits;
}
const cases=[ // [sentence, expected fillers in recap, expected live (no punctuation)]
 ["I did not particularly like this person.", [], []],
 ["I really like pizza.", [], []],
 ["I would like to answer that.", [], []],
 ["It looks like it might rain.", [], []],
 ["Things like that happen.", [], []],
 ["It was, like, really hard.", ["like"], ["like"]],
 ["She was like no way.", ["like"], ["like"]],
 ["Um like I was there.", ["um","like"], ["um","like"]],
 ["It was [p] like [p] the worst day.", ["like"], ["like"]],
 ["It was so good.", [], []],
 ["I was tired so I left.", [], []],
 ["I think so.", [], []],
 ["So, I think the answer is yes.", ["so"], ["so"]],
 ["So I started a club.", ["so"], ["so"]],
 ["Do you know where it is?", [], []],
 ["It was, you know, a big deal.", ["you know"], []],  // live lacks commas; the recap catches it
 ["What kind of job is it?", [], []],
 ["I kind of agree.", ["kind of"], ["kind of"]],
];
let fail=0;
for(const [s,er,el] of cases){ const r=count(s,true), l=count(s.replace(/,/g,'').replace(/\[p\] /g,''),false);
  const ok=JSON.stringify(r)===JSON.stringify(er) && JSON.stringify(l)===JSON.stringify(el); if(!ok) fail++;
  console.log((ok?'ok  ':'FAIL')+' '+s.padEnd(44)+' recap='+JSON.stringify(r)+' live='+JSON.stringify(l)); }
console.log(fail ? fail + " failing" : "all pass"); process.exit(fail ? 1 : 0);
