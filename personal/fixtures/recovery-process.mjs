// IPC-only integration harness. Never mounted as an HTTP route or bundled.
import {startPersonalServer} from '../host.mjs';
import {captureRoomCheckpoint} from '../room-checkpoint.mjs';
import {buildIdentity} from '../build-identity.mjs';
let crash=false,writeFailure=false;const identity=await buildIdentity();
const app=await startPersonalServer({port:0,stateDir:process.argv[2],seedFn:()=>69,
  log:{info(){},warn(){},error(...args){console.error(...args);},debug(){}},
  stateOptions:{beforeCommit(){if(crash)process.kill(process.pid,'SIGKILL');if(writeFailure)throw new Error('Injected storage fault');}}});
process.send({ready:true,url:app.url});
process.on('message',message=>{
  if(message.action==='backup'){app.recovery.backupTo(process.argv[2]+'/backup').then(()=>process.send({rid:message.rid}));return;}
  if(message.action==='crash-next-commit'){crash=true;process.send({rid:message.rid,armed:true});return;}
  if(['fail-writes','resume-writes'].includes(message.action)){writeFailure=message.action==='fail-writes';process.send({rid:message.rid});return;}
  if(message.action==='finish'){for(const room of app.lobby.rooms.values())room.match?.finish({victory:false,reason:'defeat'});process.send({rid:message.rid});return;}
  if(message.action==='inspect')process.send({rid:message.rid,blocked:app.recovery.blocked,rooms:[...app.lobby.rooms.values()].filter(r=>r.match).map(r=>{
    let state=null;try{state=captureRoomCheckpoint(r.match,identity);}catch{}
    return {code:r.code,phase:r.match.phase,runId:r.match.personalRunId,epoch:r.match.personalEpoch,committed:r.match.personalCommitted,state};
  })});
});
process.on('SIGTERM',()=>app.close().then(()=>process.exit(0)));
