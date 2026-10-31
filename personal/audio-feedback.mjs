// Fill presentation gaps only; upstream gameActions and battle events keep their own cues.
export const WARM_UI=['click','back','confirm','tab','pick','drop','error','buy','refresh','freeze','levelup','merge','equip','itemMerge','ready','battleStart'];

function inventory(view) {
  const result=new Map();
  for(const piece of [...(view?.hand||[]),...(view?.temp||[]),...(view?.board||[])]) {
    if(!piece)continue;
    if(piece.kind==='item')result.set(piece.uid,piece.id);
    for(const item of piece.items||[])result.set(item.uid,item.id);
  }
  return result;
}

export function preparationCues(next,previous,items={}) {
  items=items||{};
  const a=next?.match,b=previous?.match;
  if(!a?.private||!b?.private||a.private===b.private||a.public?.phase!=='PREP'||b.public?.phase!=='PREP'
      ||a.public.round!==b.public.round||a.private.playerId!==b.private.playerId
      ||(previous.connection&&previous.connection.status!=='online')
      ||next.room?.code!==previous.room?.code)return [];
  const cues=[];
  if(Number.isFinite(a.private.stats?.merges)&&Number.isFinite(b.private.stats?.merges)
      &&a.private.stats.merges>b.private.stats.merges)cues.push('merge');
  const before=inventory(b.private),after=inventory(a.private);
  // Observe a consumed normal item AND a new golden counterpart. A move, an
  // equip/unequip or a newly granted golden reward alone is not a merge.
  for(const [uid,id]of after) {
    const rec=items[id];
    if(before.has(uid)||!rec?.isGolden)continue;
    if([...before].some(([old,base])=>!after.has(old)&&items[base]?.upgradeChessId===id)) {
      cues.push('itemMerge');break;
    }
  }
  return cues;
}

export function installAudioFeedback({audio,store,selectRoute,data,document:doc=document,window:win=window}) {
  let warming=false,warmedManifest=null,stopped=false;
  const warm=async()=>{
    const manifest=audio.getManifest();
    if(stopped||warming||!audio.ctx||audio.volumes.muted||audio.volumes.uiSfx<=0||!manifest?.audio||manifest===warmedManifest)return;
    warming=true;
    const urls=[...new Set(WARM_UI.map(k=>manifest.audio.sfx?.ui?.[k]).filter(Boolean))];
    // Serial speculative requests; share upstream's deduplication and PCM LRU.
    try{for(const url of urls){if(stopped||audio.volumes.muted||audio.volumes.uiSfx<=0)break;await audio._buffer(url);}if(!stopped&&!audio.volumes.muted&&audio.volumes.uiSfx>0)warmedManifest=manifest;}
    finally{warming=false;}
  };
  const gesture=()=>queueMicrotask(()=>{warm().catch(()=>{});});
  for(const event of ['pointerdown','keydown','touchend','click'])win.addEventListener(event,gesture,{passive:true});
  const offData=data.subscribe(name=>{if(name==='assets')gesture();});
  const click=e=>{
    const el=e.target?.closest?.('button,[role="tab"]');
    if(!el||el.disabled||el.getAttribute('aria-disabled')==='true')return;
    const route=selectRoute(store.get());
    const settings=el.closest('.modal__box')?.querySelector('.set-list');
    if(!['title','lobby','room'].includes(route)&&!settings&&!el.closest('dialog.tactics,.tactics-open'))return;
    // Game shop/board events are intentionally excluded: their acknowledgements
    // already emit the correct buy/equip/error sound through upstream gameActions.
    const back=/关闭|完成|返回|close|done|back/i.test(el.getAttribute('aria-label')||el.textContent||'');
    audio.sfx(back?'back':el.getAttribute('role')==='tab'?'tab':'click',{volume:0.5});
  };
  doc.addEventListener('click',click);
  const close=e=>{
    const modal=doc.querySelector('.modal');
    if(modal&&((e.type==='keydown'&&e.key==='Escape')||(e.type==='mousedown'&&e.target===modal)))audio.sfx('back',{volume:0.5});
  };
  doc.addEventListener('keydown',close);doc.addEventListener('mousedown',close);
  const offStore=store.subscribe((s,p)=>{for(const cue of preparationCues(s,p,data.get('items')))audio.sfx(cue);});
  return ()=>{stopped=true;offData();offStore();doc.removeEventListener('click',click);doc.removeEventListener('keydown',close);doc.removeEventListener('mousedown',close);for(const e of ['pointerdown','keydown','touchend','click'])win.removeEventListener(e,gesture);};
}
