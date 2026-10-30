import test from 'node:test';import assert from 'node:assert/strict';
import {createRecorder,validateReplay} from './replays.mjs';
import {analyzeBattle,coachPayload,compareBattles} from './tactics.mjs';
import {resolveEvidence,validateModelCards} from './evidence.mjs';
import {sanitizeCoachRequest} from './coach-service.mjs';
async function recorded(){const saved=[],r=createRecorder({save:v=>saved.push(v),context:()=>({selfId:'secret-player',engineHash:'a'.repeat(64),dataHash:'b'.repeat(64),scenario:{mode:'coop',difficulty:'NORMAL',stageId:'stage'}})});
 r.start({battleId:'battle',fieldId:'f',spec:{seed:1},authoritative:true});r.field({fieldId:'f',units:[{id:1,ownerId:'secret-player',name:'Guard'},{id:2,ownerId:'other',name:'Other'}]});r.events({fieldId:'f',gt:2,ev:[['die',1],['die',2]]});r.finish({battleId:'battle',result:{time:3,perPlayer:{'secret-player':{damageDealt:4,healingDone:0,deaths:1,unitStats:[],leaked:[]}}}});await r.flush();return saved.at(-1);}
test('every coach card resolves stable facts/events through export, with personal casualty scope',async()=>{
 const r=validateReplay(JSON.parse(JSON.stringify(await recorded()))),a=analyzeBattle(r);
 for(const c of a.advice){assert.ok(c.refs.length);for(const ref of c.refs)assert.ok(resolveEvidence(a.evidence,ref));}
 const survival=a.advice.find(x=>x.id==='survival');assert.ok(survival.refs.includes(r.events[0].id));assert.ok(!survival.refs.includes(r.events[1].id));
 assert.equal(resolveEvidence(a.evidence,survival.refs[0]).path,'result.perPlayer[self].deaths');
 assert.equal(compareBattles(r,r).sameScenario,true);assert.equal(compareBattles(r,{...r,provenance:{...r.provenance,dataHash:'c'.repeat(64)}}).sameScenario,false);
});
test('model packages contain request-local references and reject missing or foreign citations',async()=>{
 const payload=sanitizeCoachRequest(coachPayload(await recorded()));assert.equal(payload.version,2);
 assert.ok(!JSON.stringify(payload).includes('secret-player'));
 const card={observation:'Recorded',hypothesis:'Possible cause',action:'Change one position',refs:[payload.references[0].id]};
 assert.equal(validateModelCards({cards:[card]},payload.references.map(x=>x.id)).length,1);
 for(const refs of [[],['foreign:e1'],['e999']])assert.throws(()=>validateModelCards({cards:[{...card,refs}]},payload.references.map(x=>x.id)));
});
test('restart and takeover remain visible after final result; final cannot be overwritten by earlier async save',async()=>{
 const saved=[];const r=createRecorder({save:async v=>{await new Promise(resolve=>setTimeout(resolve,v.result?1:10));saved.push(v);}});
 r.start({battleId:'b',fieldId:'f'});r.snap({fieldId:'f',gt:0,units:[]});const partial=r.flush();r.start({battleId:'b',fieldId:'f'});r.gap({battleId:'b'},'takeover');r.finish({battleId:'b',result:{time:1}});await partial;await r.flush();
 assert.equal(saved.at(-1).quality.resultReceived,true);assert.deepEqual(saved.at(-1).quality.gaps,['restart','takeover']);
});
test('same-seed attempts have distinct recordings and duplicate final receipts cannot replace the first result',async()=>{
 const saved=[];let attemptId='first';const r=createRecorder({save:v=>saved.push(v),context:()=>({runId:'same-run',attemptId})});
 r.start({battleId:'same-upstream-id',fieldId:'f'});r.finish({battleId:'same-upstream-id',result:{time:8}});await r.flush();const first=saved.at(-1);
 r.finish({battleId:'same-upstream-id',result:{time:99}});await r.flush();assert.equal(saved.at(-1).result.time,8);
 attemptId='second';r.start({battleId:'same-upstream-id',fieldId:'f'});r.finish({battleId:'same-upstream-id',result:{time:12}});await r.flush();
 assert.notEqual(saved.at(-1).id,first.id);assert.equal(saved.at(-1).result.time,12);
});
