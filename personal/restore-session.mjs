import {checkpointRunId} from './run-identity.mjs';

// A requested save becomes active only after the worker confirms a real restore
// and the vault write succeeds. Old/failed restore frames cannot activate it.
export function createRestoreSession({send,commit,onChange=()=>{},timeoutMs=15000,setTimer=setTimeout,clearTimer=clearTimeout}) {
  let pending=null,accepted=null,seq=0;
  function finish(request,error,value) {
    if(pending!==request)return;
    clearTimer(request.timer);
    pending=null;onChange(false);
    if(error)request.reject(error);else{accepted=request.id;request.resolve(value);}
  }
  return {
    start(snapshot) {
      if(pending)return Promise.reject(new Error('正在恢复，请等待当前操作完成'));
      return new Promise((resolve,reject)=>{
        const request=pending={id:`restore-${++seq}`,snapshot,resolve,reject,committing:false};
        request.timer=setTimer(()=>finish(request,new Error('恢复确认超时')),timeoutMs);
        onChange(true);
        try{send({t:'local.restore',requestId:request.id,snapshot});}catch(error){finish(request,error);}
      });
    },
    receive(frame) {
      const request=pending;
      if(!request || frame.requestId!==request.id || request.committing)return false;
      if(frame.t==='local.restore-error'){finish(request,new Error(frame.message));return true;}
      if(frame.t!=='local.restored')return false;
      try {
        if(!frame.snapshot || checkpointRunId(frame.snapshot)!==checkpointRunId(request.snapshot) || frame.snapshot.round!==request.snapshot.round)throw new Error('恢复确认与请求的存档不一致');
      }catch(error){finish(request,error);return true;}
      request.committing=true;
      clearTimer(request.timer); // Only the worker ACK is timed; never abandon an in-flight vault commit.
      Promise.resolve().then(()=>commit(frame.snapshot)).then(value=>finish(request,null,value),error=>finish(request,error));
      return true;
    },
    accepts(frame) {return !frame.restoreRequestId || frame.restoreRequestId===accepted;},
    fail(error) {if(pending&&!pending.committing)finish(pending,error);},
  };
}
