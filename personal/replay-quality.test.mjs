import test from 'node:test';
import assert from 'node:assert/strict';
import {createRecorder, validateReplay, replayStatusText, REPLAY_KIND} from './replays.mjs';
import {analyzeBattle, compareBattles, coachPayload} from './tactics.mjs';
import {sanitizeCoachRequest} from './coach-service.mjs';

const empty = () => ({format:REPLAY_KIND,version:1,id:'r',round:1,kind:'normal',selfId:'self',units:{},frames:[],events:[],result:null,partial:true});
const player = overrides => ({damageDealt:0,healingDone:0,deaths:0,leaked:[],unitStats:[],...overrides});

test('missing results, metrics and personal scope stay unknown; observed zeros stay zero', () => {
  const missing=analyzeBattle(empty());
  assert.deepEqual(missing.totals,{damage:null,healing:null,deaths:null,leaks:null});
  assert.equal(missing.seconds,null);
  const r={...empty(),partial:false,result:{time:8,perPlayer:{self:player({damageDealt:undefined,healingDone:undefined,deaths:1,leaked:undefined,unitStats:[{kind:'op',defId:'unknown'}]})}}};
  const a=analyzeBattle(r);
  assert.deepEqual(a.totals,{damage:null,healing:null,deaths:1,leaks:null});
  assert.equal(a.rows[0].dmg,null);assert.equal(a.rows[0].dps,null);
  assert.ok(!a.advice.some(x=>x.id==='coverage'));
  assert.match(a.advice.find(x=>x.id==='survival').evidence,/未记录/);
  const other=analyzeBattle({...r,selfId:'absent'});
  assert.deepEqual(other.rows,[]);assert.equal(other.totals.deaths,null);
  assert.equal(analyzeBattle({...r,selfId:undefined}).totals.deaths,null);
  const zero=analyzeBattle({...r,result:{time:8,perPlayer:{self:player()}}});
  assert.deepEqual(zero.totals,{damage:0,healing:0,deaths:0,leaks:0});
  assert.equal(compareBattles(empty(),r).damage,null);
  assert.equal(compareBattles(empty(),r).seconds,null);
});

test('unknown values survive the complete coach payload and proxy sanitization path', () => {
  const r={...empty(),result:{perPlayer:{self:player({damageDealt:undefined,unitStats:[{name:'Op',defId:'op',kind:'op',dmg:0}]})}}};
  const payload=sanitizeCoachRequest(JSON.parse(JSON.stringify(coachPayload(r))));
  assert.equal(payload.analysis.seconds,null);
  assert.equal(payload.analysis.totals.damage,null);
  assert.equal(payload.analysis.rows[0].dmg,0);
  for(const k of ['heal','taken','attacks','kills','dps'])assert.equal(payload.analysis.rows[0][k],null,k);
});

test('sampling limits survive final results and JSON round trip as explicit truncation', async () => {
  const saved=[];const r=createRecorder({save:v=>saved.push(v),context:()=>({selfId:'self'})});
  r.start({battleId:'cap',fieldId:'f',spec:{seed:3,kind:'normal'}});
  r.field({fieldId:'f',units:Array.from({length:1501},(_,id)=>({id,name:`u${id}`}))});
  for(let gt=0;gt<=600;gt++)r.snap({fieldId:'f',gt,killed:gt===1?0:undefined,total:gt===1?0:undefined,units:gt===0?Array.from({length:301},(_,id)=>[id,1,1,10,10]):[]});
  r.events({fieldId:'f',gt:601,ev:Array.from({length:2501},()=>['die',1])});
  r.finish({battleId:'cap',result:{time:601,perPlayer:{self:player()}}});
  await r.flush();const record=validateReplay(JSON.parse(JSON.stringify(saved.at(-1))));
  assert.equal(record.partial,false,'result receipt is independent of sampling coverage');
  assert.equal(record.quality.resultReceived,true);
  assert.equal(record.quality.truncated,true);
  assert.match(replayStatusText(record),/已收到结算.*采样已截断/);
  assert.deepEqual(record.quality.dropped,{frames:1,events:1,frameUnits:1,unitMetadata:1});
  assert.equal(record.frames.length,600);assert.equal(record.events.length,2500);
  assert.equal(record.frames[0].killed,null);assert.equal(record.frames[0].total,null);
  assert.equal(record.frames[1].killed,0);assert.equal(record.frames[1].total,0);
  assert.equal(analyzeBattle(record).totals.leaks,0,'a known final total remains useful despite sampling limits');
  assert.ok(analyzeBattle(record).advice.some(x=>x.id==='recording-quality'));
  const forwarded=sanitizeCoachRequest(coachPayload(record));
  assert.equal(forwarded.quality.truncated,true);
});

test('legacy quality is unknown, never silently upgraded to complete; invalid quality is rejected', () => {
  const r={...empty(),partial:false,result:{time:1,perPlayer:{self:player()}}};
  assert.equal(analyzeBattle(r).quality.truncated,null);
  assert.match(replayStatusText(r),/完整性未知/);
  assert.match(replayStatusText(empty()),/未收到结算/);
  assert.throws(()=>validateReplay({...r,quality:{version:1,resultReceived:true,truncated:false,dropped:{frames:-1,events:0,frameUnits:0,unitMetadata:0}}}),/质量/);
});

test('v1 same seed is not advertised as a controlled comparison without engine/content provenance', () => {
  const r={...empty(),partial:false,seed:3,result:{time:1,perPlayer:{self:player()}}};
  assert.equal(compareBattles(r,r).sameScenario,false);
  assert.equal(compareBattles({...r,engineHash:'old'},{...r,engineHash:'new'}).sameScenario,false);
});
