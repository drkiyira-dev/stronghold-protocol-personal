import test from 'node:test';import assert from 'node:assert/strict';
import {createTerminalSession,terminalCapabilities} from './terminal-session.mjs';
test('closing before pause ACK releases only the terminal-owned lease',async()=>{
  let ack;const released=[];let opened=0,closed=0;
  const s=createTerminalSession({pause:()=>new Promise(r=>ack=r),release:l=>released.push(l),onOpen:()=>opened++,onClose:()=>closed++});
  const pending=s.open();s.close();ack({run:'first'});await pending;
  assert.equal(opened,1);assert.equal(closed,1);assert.deepEqual(released,[{run:'first'}]);
});
test('manual pause or remote session produces no resume on close',async()=>{
  let releases=0;const s=createTerminalSession({pause:async()=>null,release:()=>releases++,onOpen(){},onClose(){}});
  await s.open();s.close();s.close();assert.equal(releases,0);
  assert.equal(terminalCapabilities({mode:'remote'}).roomRecovery,false);
  assert.equal(terminalCapabilities({mode:'remote',persistence:{enabled:true}}).roomRecovery,true);
});
