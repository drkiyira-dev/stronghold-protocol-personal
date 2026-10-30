import test from 'node:test';import assert from 'node:assert/strict';
import {createRecorder,validateReplay,REPLAY_KIND} from './replays.mjs';
import {analyzeBattle,compareBattles,coachPayload} from './tactics.mjs';
import {validateChallenge,challengeViolation,CHALLENGE_PRESETS} from './challenges.mjs';
import {validateServerAddress} from './connection.mjs';
const result={time:8,perPlayer:{p_a:{damageDealt:160,healingDone:20,deaths:1,leaked:[{counted:true},{counted:false}],unitStats:[{uid:'u1',defId:'op1',kind:'op',dmg:160,heal:0,taken:200,attacks:4},{uid:'u2',defId:'op2',kind:'op',dmg:0,heal:0,attacks:0}]}}};
test('recorder preserves actual sampled frames, death/leak/skill events and final unit stats across JSON export',async()=>{
 const saved=[],r=createRecorder({save:v=>saved.push(v),context:()=>({selfId:'p_a',round:2,preparation:{funds:2,deployed:2,cap:3,bench:1}})});
 r.start({battleId:'b1',fieldId:'f1',spec:{seed:24,kind:'normal'}});r.field({fieldId:'f1',units:[{id:1,uid:'u1',ownerId:'p_a',name:'测试干员',defId:'op1',side:'ally'}]});r.snap({fieldId:'f1',gt:0,units:[[1,2,3,100,100,5]]});r.snap({fieldId:'f1',gt:.5,units:[[1,2,3,90,100,5]]});r.snap({fieldId:'f1',gt:1,units:[[1,2,3,80,100,5]]});r.events({fieldId:'f1',gt:1,ev:[['skill',1,1],['die',1],['leak',2]]});r.finish({battleId:'b1',result});await r.flush();const record=validateReplay(JSON.parse(JSON.stringify(saved.at(-1))));assert.equal(record.frames.length,2);assert.equal(record.events.length,3);assert.equal(record.partial,false);const a=analyzeBattle(record);assert.equal(a.rows[0].dps,20);assert.equal(a.totals.leaks,1);assert.ok(a.advice.some(x=>x.id==='coverage'));assert.ok(a.advice.some(x=>x.id==='funds'));assert.ok(a.advice.some(x=>x.id==='survival'));const payload=JSON.stringify(coachPayload({...record,nickname:'private',token:'secret'}));assert.ok(!payload.includes('private')&&!payload.includes('secret')&&!payload.includes('p_a'));
});
test('hostile or oversized replay coordinates cannot create infinite drawing loops',()=>{
 const record={format:REPLAY_KIND,version:1,id:'bad',units:{},events:[],frames:[{t:0,units:[[1,1e30,0,1,1]]}]};assert.throws(()=>validateReplay(record),/坐标/);record.frames=[{t:2,units:[]},{t:1,units:[]}];assert.throws(()=>validateReplay(record),/时间轴/);
});
test('comparison describes differences without treating unknown seeds or different rules as controlled trials',()=>{
 const r={frames:[],units:{},result,round:1,kind:'normal'};assert.equal(compareBattles(r,r).sameScenario,false);assert.equal(compareBattles({...r,seed:2},{...r,seed:2}).sameScenario,true);assert.equal(compareBattles({...r,seed:2},{...r,seed:2,challenge:{id:'other'}}).sameScenario,false);
});
test('challenge limits allow repositioning and swaps but reject a fifth deployment, refresh and equipment',()=>{
 const c=structuredClone(CHALLENGE_PRESETS[0]);c.rules.noRefresh=true;c.rules.noEquipment=true;c.rules.bannedOperators=['banned'];validateChallenge(c);const p={board:new Map(Array.from({length:4},(_,i)=>[`${i},0`,{uid:'u'+i,kind:'chess',id:'allowed'}])),hand:[{uid:'extra',kind:'chess',id:'allowed'},{uid:'bad',kind:'chess',id:'banned'},{uid:'summon',kind:'token',id:'tok'}],temp:[],shop:{slots:[]}};
 const move=(uid,row,col)=>({t:'g.move',uid,to:{area:'board',row,col}});assert.match(challengeViolation(c,move('extra',5,0),p),/最多部署/);assert.equal(challengeViolation(c,move('u0',5,0),p),null);assert.equal(challengeViolation(c,move('extra',0,0),p),null);assert.equal(challengeViolation(c,move('summon',5,0),p),null);assert.match(challengeViolation(c,move('bad',0,0),p),/禁用/);assert.ok(challengeViolation(c,{t:'g.refresh'},p));assert.ok(challengeViolation(c,{t:'g.equip'},p));assert.throws(()=>validateChallenge({...c,script:'alert(1)'}),/脚本/);
});
test('server configuration rejects credential-bearing and mixed-content endpoints',()=>{assert.throws(()=>validateServerAddress('ws://127.0.0.1:4174/ws','https:'),/wss/);assert.throws(()=>validateServerAddress('wss://user:secret@server.test/ws'));assert.equal(validateServerAddress('wss://example.org/ws','https:'),'wss://example.org/ws');});

test('Spine adapter accepts recorded external hosts and rejects executable, credential and protocol-relative URLs',async()=>{
 const {validPersonalSpine}=await import('./spine-urls.mjs');const entry={skel:'https://raw.githubusercontent.com/fexli/repo/main/model.skel',atlas:'https://raw.githubusercontent.com/fexli/repo/main/model.atlas',anims:{}};assert.equal(validPersonalSpine(entry),true);for(const skel of ['javascript:alert(1)','//evil.test/model.skel','https://user:password@raw.githubusercontent.com/model.skel','https://evil.test/model.skel'])assert.equal(validPersonalSpine({...entry,skel}),false);
});
