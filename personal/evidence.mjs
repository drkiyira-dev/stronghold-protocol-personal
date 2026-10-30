// Stable references resolve only inside the selected record. No invented events.
export const evidenceId=(record,kind,key)=>`${encodeURIComponent(record.id || 'legacy')}:${kind}:${key}`;
export function buildEvidence(record,analysis){
  const facts=[],events=[];
  const fact=(key,value,label,path)=>facts.push({id:evidenceId(record,'f',key),kind:'fact',key,value,known:value!==null&&value!==undefined,label,path,scope:'personal'});
  for(const [key,value] of Object.entries(analysis.totals))fact(`total.${key}`,value,({damage:'个人伤害',healing:'个人治疗',deaths:'个人死亡',leaks:'个人漏敌'})[key],record.summaryOnly?`summary.${key}`:`result.perPlayer[self].${({damage:'damageDealt',healing:'healingDone',deaths:'deaths',leaks:'leaked[counted !== false].length'})[key]}`);
  fact('duration',analysis.seconds,'结算时长',record.summaryOnly?'summary.seconds':'result.time');
  for(const key of ['funds','deployed','cap','bench'])fact(`prep.${key}`,Number.isFinite(record.preparation?.[key])?record.preparation[key]:null,`休整 ${key}`,`preparation.${key}`);
  for(const [i,row] of analysis.rows.entries())for(const key of ['dmg','heal','taken','attacks','kills','dps'])fact(`unit.${i}.${key}`,row[key],`${row.name || '干员'} · ${key}`,key==='dps'?`result.perPlayer[self].unitStats[${row.sourceIndex}].dmg / result.time`:`result.perPlayer[self].unitStats[${row.sourceIndex}].${key}`);
  fact('quality.truncated',analysis.quality.truncated,'采样截断','quality.truncated');
  fact('quality.resultReceived',analysis.quality.resultReceived,'收到结算','result');
  for(const [i,event]of (record.events || []).entries()){
    const unit=record.units?.[event.unit];
    // An enemy leaking in the current field is a field event, not a personal
    // casualty. Unknown ownership is never silently attributed to the viewer.
    const scope=unit?.ownerId===record.selfId?'personal':'field';
    events.push({id:event.id || evidenceId(record,'e',i),kind:'event',type:event.type,t:event.t,unit:event.unit,
      label:`${event.t.toFixed(1)}s · ${event.type} · ${unit?.name || event.unit}`,scope,source:record.version===2?'client-simulator':'legacy-derived'});
  }
  return {version:1,facts,events};
}
export function resolveEvidence(evidence,id){return [...evidence.facts,...evidence.events].find(x=>x.id===id) || null;}
export function citeAdvice(record,analysis){
  const evidence=buildEvidence(record,analysis),refs=keys=>keys.map(k=>evidenceId(record,'f',k));
  for(const card of analysis.advice){
    const keys={leaks:['total.leaks'],survival:['total.deaths','total.healing'],funds:['prep.funds'],capacity:['prep.deployed','prep.cap','prep.bench'],stable:['total.damage','total.leaks','total.deaths'],limited:['quality.resultReceived'], 'recording-quality':['quality.truncated']}[card.id] || [];
    card.refs=refs(keys);card.ruleVersion='2.0';card.confidence='observation';
    if(card.id==='coverage')card.refs=analysis.rows.flatMap((u,i)=>u.kind==='op'&&u.attacks===0&&u.dmg===0&&u.heal===0?refs([`unit.${i}.attacks`,`unit.${i}.dmg`,`unit.${i}.heal`]):[]);
    const associated=evidence.events.filter(e=>card.id==='survival'?e.type==='die'&&e.scope==='personal':false);
    card.refs.push(...associated.slice(0,4).map(e=>e.id));
    card.hypothesis=({leaks:'漏敌可能与覆盖、阻挡或火力有关，当前统计不能区分原因。',survival:'前排承伤或治疗覆盖可能不足，需要结合事件核查。',coverage:'可能存在站位或攻击范围问题，也可能是正常的辅助职责。'})[card.id] || '此建议只依据已记录事实，不预测胜率或因果效果。';
    if(!card.refs.length)card.refs=refs(['quality.resultReceived']);
  }
  return {...analysis,source:'local-rules-v2',evidence};
}
// Model IDs are request-local and contain no player/room/run identity. Resolve
// them back to local evidence only after validating the entire model response.
export function modelEvidence(analysis){
  const facts=analysis.evidence.facts.filter(f=>f.known).slice(0,160),events=analysis.evidence.events.slice(0,80);
  return [...facts,...events].map((e,i)=>({id:`e${i+1}`,localId:e.id,kind:e.kind,label:e.label,
    ...(e.kind==='fact'?{value:e.value}:{time:e.t,type:e.type,scope:e.scope})}));
}
export function validateModelCards(value,allowed){
  if(!value || !Array.isArray(value.cards) || !value.cards.length || value.cards.length>5)throw new Error('模型没有返回有效的证据卡片');
  const ids=new Set(allowed);
  const text=s=>typeof s==='string'&&s.trim()&&s.length<=1200;
  return value.cards.map(c=>{
    if(!c || !['observation','hypothesis','action'].every(k=>text(c[k])) || !Array.isArray(c.refs)||!c.refs.length||c.refs.length>8||c.refs.some(id=>!ids.has(id)))throw new Error('模型引用不在本场证据范围内');
    return {observation:c.observation,hypothesis:c.hypothesis,action:c.action,refs:[...new Set(c.refs)]};
  });
}
