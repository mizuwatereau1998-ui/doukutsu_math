import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import '../js/config.js';import '../js/math.js';import '../js/physics.js';
import '../js/obstacles.js';import '../js/game.js';
import { routeDirection } from './route-driver.mjs';
let P=globalThis.PopEscape;
const sourceIndex=process.argv.indexOf('--source');
if(sourceIndex>=0) {
  // Compare the previous generator using the same low-input route evaluator and resolution.
  const root=process.argv[sourceIndex+1],ctx=vm.createContext({});
  const current=fs.readFileSync(new URL('../js/obstacles.js',import.meta.url),'utf8');
  const solver=current.slice(current.indexOf('  function findRoute('),current.indexOf('  // Measure the real time'));
  for(const file of ['config','math','physics','obstacles','game']) {
    let text=fs.readFileSync(`${root}/js/${file}.js`,'utf8');
    if(file==='config')text=text.replace('routeDecisionSeconds: 0.15','routeDecisionSeconds: 0.05').replace('routeMaxStates: 120','routeMaxStates: 320');
    if(file==='obstacles')text=text.slice(0,text.indexOf('  function findRoute('))+solver+text.slice(text.indexOf('  function advancedPattern('));
    vm.runInContext(text,ctx);
  }
  P=ctx.PopEscape;
}
const C=P.CONFIG,baseline=sourceIndex>=0;
function seeded(seed){return()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32)}
function speedAt(d){return C.startSpeed+(C.maxSpeed-C.startSpeed)*(1-Math.exp(-d/C.speedGrowthDistance))}
function replay(player,group,distance,route,inspect=false){
 const p={...player},list=group.map(o=>({...o}));let d=distance,ai=0;
 const contacts=new Map(),double=new Set(),lanes=new Set(),obstacleKinds=new Set();
 for(let step=0;step<route.steps;step++){
  if(route.actions[ai]?.step===step)assert.ok(P.Physics.move(p,route.actions[ai++].direction,null));
  const speed=speedAt(d);d+=speed*C.fixedStep/C.pixelsPerMeter;
  P.Physics.update(p,C.fixedStep,null);
  for(const o of list){o.x-=speed*P.Obstacles.speedFactor(o)*C.fixedStep;o.age=(o.age||0)+C.fixedStep;
   assert.equal(P.Obstacles.hits(o,p),false,`collision ${distance}/${step}`);
   if(o.x<=C.playerX && !contacts.has(o.wave))contacts.set(o.wave,step*C.fixedStep);
   obstacleKinds.add(o.kind);
  }
  if(p.grounded)lanes.add(p.lane);
  if(inspect) for(const wave of new Set(group.map(o=>o.wave))){
   const active=list.filter(o=>o.wave===wave);
   const blocked=[0,1,2].filter(lane=>active.some(o=>P.Obstacles.hits(o,{...P.Physics.createPlayer(),topLane:0,lane,y:C.lanes[lane]})));
   assert.ok(blocked.length<3,'no all-lane grounded seal');
   if(blocked.length===2)double.add(wave);
  }
 }
 const times=[...contacts.values()].sort((a,b)=>a-b);
 return {double:double.size,lanes:[...lanes], span:Math.max(0.1,times.at(-1)-times[0]),contactGaps:times.slice(1).map((t,i)=>t-times[i])};
}
const rows=[];
for(const [distance,width]of [[900,600],[1500,500],[2000,1000],[3000,2000]]){
 const row={distance,trials:60,accepted:0,types:{},rejected:0,unsafe:0,tooEasy:0,empty:0,
  meanInputs:0,meanInputsPerSecond:0,meanMaxInputsIn2s:0,
  meanSwitches:0,doubleWaves:0,tripleCombos:0,noInputSurvivors:0,sameLaneSurvivors:0,sameLanePatterns:0,
  oneInputSurvivors:0,meanContactGap:0,minContactGap:Infinity,maxPlanMs:0};
 let sumSeconds=0,gaps=[];
 for(let i=0;i<row.trials;i++){
  const d=distance+(i/row.trials)*width,rng=seeded(Math.imul(i+81,2654435761));
  const p=P.Physics.createPlayer();Object.assign(p,{lane:i%3,y:C.lanes[i%3],topLane:0});
  if(i%5===0)P.Physics.move(p,-1,null);
  if(i%5===1&&p.lane<2)P.Physics.move(p,1,null);
  const before=JSON.stringify(p),stats={rejected:0,fallback:0},start=performance.now();
  const group=P.Obstacles.plan(d,speedAt(d),p,[],rng,false,stats);
  row.maxPlanMs=Math.max(row.maxPlanMs,performance.now()-start);
  row.rejected+=stats.rejected;row.unsafe+=stats.unsafe||0;row.tooEasy+=stats.tooEasy||0;
  assert.equal(JSON.stringify(p),before);
  if(!group.length){row.empty++;continue;}
  row.accepted++;row.types[group[0].pattern]=(row.types[group[0].pattern]||0)+1;
  const route=P.Obstacles.findRoute(p,group,d);assert.ok(route);
  if(!baseline && d>=2000)assert.ok(route.actions.length>=P.Obstacles.advancedBand(d).minInputs);
  for(let ai=1;ai<route.actions.length;ai++)
    assert.ok((route.actions[ai].step-route.actions[ai-1].step)*C.fixedStep>=0.18);
  row.meanInputs+=route.actions.length;sumSeconds+=route.steps*C.fixedStep;
  const result=replay(p,group,d,route,!baseline);
  if(!baseline)assert.equal(result.double,new Set(group.map(o=>o.wave)).size,'all waves block two grounded lanes');
  row.doubleWaves+=result.double;gaps.push(...result.contactGaps);
  let busiest=0;
  for(const a of route.actions)busiest=Math.max(busiest,route.actions.filter(b=>b.step>=a.step&&b.step<a.step+2/C.fixedStep).length);
  row.meanMaxInputsIn2s+=busiest;
  const safe=[...new Map(group.map(o=>[o.wave,o.safeLane])).values()];
  row.meanSwitches+=safe.slice(1).filter((x,j)=>x!==safe[j]).length;
  if(['spider','bat','spikes'].every(k=>group.some(o=>o.kind===k)))row.tripleCombos++;
  // Grounded probes are independent of the initial lane and replay controller.
  let sameLanePattern=false;
  for(const lane of [0,1,2]){
   const still={...P.Physics.createPlayer(),lane,y:C.lanes[lane],topLane:0};
   if(P.Obstacles.findRoute(still,group,d,{maxActions:0}))row.noInputSurvivors++;
   if(P.Obstacles.findRoute(still,group,d,{stayLane:lane})){row.sameLaneSurvivors++;sameLanePattern=true;}
  }
  row.sameLanePatterns+=sameLanePattern?1:0;
  if(P.Obstacles.findRoute(p,group,d,{maxActions:1}))row.oneInputSurvivors++;
 }
 row.meanInputsPerSecond=row.meanInputs/sumSeconds;
 row.meanInputs/=row.accepted;row.meanSwitches/=row.accepted;row.meanMaxInputsIn2s/=row.accepted;
 row.meanContactGap=gaps.reduce((a,b)=>a+b,0)/gaps.length;row.minContactGap=Math.min(...gaps);
 for(const k of Object.keys(row))if(typeof row[k]==='number')row[k]=+row[k].toFixed(3);
 if(!baseline){assert.ok(row.accepted>=57,'>=95% generated');
  if(distance>=2000){assert.equal(row.noInputSurvivors,0);assert.equal(row.sameLaneSurvivors,0);assert.equal(row.oneInputSurvivors,0);}
 }
 rows.push(row);
}
if(!baseline){
 assert.ok(rows[2].meanInputsPerSecond>rows[1].meanInputsPerSecond*1.2);
 assert.ok(rows[3].meanInputsPerSecond>rows[2].meanInputsPerSecond);
 // Full Game runs include math; action-only metrics exclude answering inputs and math duration.
 for(const row of rows){row.runs=[];
  for(const seed of [17,81,291,832]){
   let patterns=0,inputs=0,actionSeconds=0,doubleWaves=0,emptySeconds=0,maxEmpty=0,last=-1,inputGaps=[];
   const g=new P.Game({rng:seeded(seed),onEvent(e){if(e.type==='pattern'){
    patterns++;doubleWaves+=new Set(e.group.map(o=>o.wave)).size;
   }}});g.start(3,row.distance);
   for(let step=0;step<90/C.fixedStep;step++){
    if(g.question){const target=g.question.choices.findIndex((_,i)=>P.MathQuiz.isCorrect(g.question,i));if(target!==g.player.lane)g.move(target<g.player.lane?-1:1);last=-1;}
    else {actionSeconds+=C.fixedStep;const dir=routeDirection(g);if(dir){g.move(dir);inputs++;if(last>=0)inputGaps.push(g.elapsed-last);last=g.elapsed;}}
    g.update(C.fixedStep);
    emptySeconds=g.question||g.obstacles.some(o=>o.x<C.width&&o.x+o.width>C.playerX)?0:emptySeconds+C.fixedStep;
    maxEmpty=Math.max(maxEmpty,emptySeconds);
    assert.equal(g.misses,0,`full run ${row.distance}/${seed}/${g.distance}`);
   }
   assert.ok(patterns>=8);assert.ok(g.total>=3);assert.ok(maxEmpty<3);
   assert.equal(g.generationStats.empty||0,0);
   row.runs.push({seed,patterns,inputs,actionSeconds:+actionSeconds.toFixed(2),inputsPerActionSecond:+(inputs/actionSeconds).toFixed(3),
    doubleWaves,questions:g.total,maxEmpty:+maxEmpty.toFixed(2),rejected:g.generationStats.rejected,tooEasy:g.generationStats.tooEasy||0,
    unsafe:g.generationStats.unsafe||0,empty:g.generationStats.empty||0,minInputGap:+Math.min(...inputGaps).toFixed(3)});
  }
 }
}
console.log(JSON.stringify({baseline,routeDecisionSeconds:0.05,routeMaxStates:320,rows},null,2));
