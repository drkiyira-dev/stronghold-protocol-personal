// Own only the pause requested by this terminal. A late pause acknowledgement
// must be released even if Escape/route disposal closed the dialog meanwhile.
export function createTerminalSession({pause,release,onOpen,onClose,onError=()=>{}}){
  let open=false,epoch=0,lease=null;
  return {
    async open(){if(open)return;open=true;const ticket=++epoch;onOpen();
      try{const next=await pause();if(!open||ticket!==epoch){if(next)await release(next);}else lease=next;}
      catch(e){onError(e);}
    },
    close(){if(!open)return;open=false;epoch++;const previous=lease;lease=null;onClose();if(previous)Promise.resolve(release(previous)).catch(onError);},
    get isOpen(){return open;},
  };
}
export function terminalCapabilities({mode,online=true,persistence=null,phase=null}={}){
  const local=mode!=='remote';
  return {local,online,phase,prepSave:local,challenge:local,canPause:local,
    roomRecovery:!local&&persistence?.enabled===true,roomStatus:persistence,
    summary:local?'本地单人 · 休整检查点':persistence?.enabled?'自托管联机 · 已启用休整恢复':'自托管联机 · 进程内房间'};
}
