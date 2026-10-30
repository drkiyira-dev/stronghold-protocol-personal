import test from 'node:test';import assert from 'node:assert/strict';import {createServer} from 'node:http';import {createCoachHandler} from './coach-service.mjs';
const summary={version:1,round:1,kind:'normal',analysis:{seconds:30,totals:{damage:100,healing:0,deaths:0,leaks:1},rows:[{name:'Operator',dmg:100,heal:0,taken:30,attacks:5,kills:2,dps:3.33}]},token:'must-not-forward',nickname:'must-not-forward'};
test('coach proxy enforces origin/token, forwards only numeric tactical summary, and limits requests',async()=>{
 const calls=[],handler=createCoachHandler({env:{COACH_API_URL:'https://provider.example/v1/chat/completions',COACH_API_KEY:'provider-secret',COACH_MODEL:'configured-model',COACH_ACCESS_TOKEN:'local-test-token',COACH_ALLOWED_ORIGINS:'https://my-game.example'},fetchFn:async(url,opts)=>{calls.push({url,opts});return new Response(JSON.stringify({choices:[{message:{content:'检查漏敌路线。'}}]}));}});
 const server=createServer((req,res)=>handler(req,res));await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const url=`http://127.0.0.1:${server.address().port}/api/coach`;
 const request=(headers={},body=summary)=>fetch(url,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
 try{
   assert.equal((await request()).status,401);assert.equal((await request({Origin:'https://evil.example',Authorization:'Bearer local-test-token'})).status,403);assert.equal(calls.length,0);
   const headers={Origin:'https://my-game.example',Authorization:'Bearer local-test-token'};const response=await request(headers);assert.equal(response.status,200);assert.equal((await response.json()).advice,'检查漏敌路线。');assert.equal(calls.length,1);assert.ok(!calls[0].opts.body.includes('must-not-forward'));assert.equal(calls[0].opts.headers.Authorization,'Bearer provider-secret');
   assert.equal((await request(headers,{...summary,round:'invalid'})).status,400);
   for(let i=0;i<3;i++)await request(headers);assert.equal((await request(headers)).status,429);
 }finally{await new Promise(resolve=>server.close(resolve));}
});
test('unconfigured coach clearly reports unavailable without contacting a provider',async()=>{
 const handler=createCoachHandler({env:{},fetchFn:()=>{throw new Error('must not call');}}),server=createServer((req,res)=>handler(req,res));await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));try{const r=await fetch(`http://127.0.0.1:${server.address().port}/api/coach`,{method:'POST'});assert.equal(r.status,503);}finally{await new Promise(resolve=>server.close(resolve));}
});
