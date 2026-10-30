// Evidence-based coaching; no model inference or invented win probabilities.
import {replayQuality} from './replays.mjs';
import {citeAdvice,modelEvidence} from './evidence.mjs';
const n = value => Number.isFinite(value) && value>=0 ? value : null;
const numberText = value => value===null ? '未记录' : String(Math.round(value));
const sum = values => values.length && values.every(v=>v!==null) ? values.reduce((a,b)=>a+b,0) : null;
export function analyzeBattle(record) {
  const players = Object.entries(record.result?.perPlayer || {});
  // Missing identity is not permission to attribute everyone else's results to
  // the viewer. Explicit team views belong to a future versioned scope contract.
  const chosen = players.filter(([id,p]) => id===record.selfId && p);
  const seconds = n(record.result?.time);
  const quality=replayQuality(record);
  const meta = Object.values(record.units || {});
  const rows = chosen.flatMap(([owner,p]) => (p.unitStats || []).map((u,sourceIndex) => ({
    ...u, sourceIndex,owner, name:meta.find(m => m.uid === u.uid && m.ownerId === owner)?.name || record.names?.[u.defId] || u.defId,
    dmg:n(u.dmg), heal:n(u.heal), taken:n(u.taken), attacks:n(u.attacks), kills:n(u.kills),
    dps:seconds>0 && n(u.dmg)!==null ? u.dmg/seconds : null,
  }))).sort((a,b) => b.dmg-a.dmg || b.heal-a.heal);
  const totals = {
    damage:sum(chosen.map(([,p])=>n(p.damageDealt))),healing:sum(chosen.map(([,p])=>n(p.healingDone))),
    deaths:sum(chosen.map(([,p])=>n(p.deaths))),
    leaks:sum(chosen.map(([,p])=>Array.isArray(p.leaked)?p.leaked.filter(x=>x.counted!==false).length:null)),
  };
  if (record.summary) for(const key of Object.keys(totals))totals[key]=Number.isFinite(record.summary[key])?n(record.summary[key]):null;
  const advice = [];
  const unused = rows.filter(u => u.kind === 'op' && u.attacks===0 && u.dmg===0 && u.heal===0);
  if (unused.length) advice.push({id:'coverage',priority:'重点',title:'检查攻击覆盖与朝向',evidence:`${unused.map(u=>u.name).slice(0,5).join('、')}在本场的攻击、伤害和治疗均为 0。`,action:'复盘这些干员与敌人路线的相对位置；首领战优先确认攻击范围能覆盖首领。辅助或阻挡干员可能仍有贡献，不能据此直接判定无效。'});
  if (totals.leaks) advice.push({id:'leaks',priority:'重点',title:'优先处理漏敌位置',evidence:`本场记录了 ${totals.leaks} 个计入结算的漏敌。`,action:'跳转到漏敌事件，检查阻挡数量、敌人移动路线和远程火力覆盖；每次只调整一处，比较下一次结果。'});
  if (totals.deaths) advice.push({id:'survival',priority:'重点',title:'检查前排生存与治疗覆盖',evidence:`本场有 ${totals.deaths} 次己方死亡，治疗量：${numberText(totals.healing)}。`,action:'若有阵亡事件，检查其附近的承伤与治疗覆盖。调整部署顺序和医疗范围；不能被友方治疗的干员需要其他生存手段。'});
  if (n(record.preparation?.funds) > 0) advice.push({id:'funds',priority:'经济',title:'休整资金可提前规划',evidence:`准备就绪时仍有 ${record.preparation.funds} 资金。`,action:'剩余资金会在休整结束清零。下一回合先比较升级、补充阵容、装备与刷新收益，再准备就绪。'});
  const deployed = n(record.preparation?.deployed), cap = n(record.preparation?.cap);
  if (cap!==null && deployed!==null && cap > deployed && n(record.preparation?.bench) > 0) advice.push({id:'capacity',priority:'布阵',title:'还有部署容量可用',evidence:`记录到 ${deployed}/${cap} 个已部署席位，整备区仍有干员。`,action:'检查是否有可合法部署、能激活盟约或覆盖遗漏路线的候选干员。挑战规则可能限制实际可用人数。'});
  if (!advice.length && (rows.length || record.summary)) advice.push({id:'stable',priority:'复盘',title:'保留这次配置作为比较基准',evidence:`当前记录：伤害 ${totals.damage==null?'未记录':Math.round(totals.damage)}、漏敌 ${totals.leaks??'未记录'}、己方死亡 ${totals.deaths??'未记录'}。`,action:'导出本次记录，再在同一种子挑战中只改变一个站位、技能或装备，比较输出与生存；这些数据不等同于未来胜率。'});
  if (!rows.length) advice.push({id:'limited',priority:'数据范围',title:record.summaryOnly?'这份记录只有汇总数据':chosen.length?'干员级统计不可用':'个人统计不可用',evidence:record.summaryOnly ? '旧版战绩未保存逐秒画面和干员级伤害。' : '尚未收到当前玩家的干员级结算，或记录缺少个人身份；未记录不等于 0。',action:'保留已有记录；完成一场可录制的本地战斗后再查看个人统计。'});
  if(quality.truncated!==false)advice.push({id:'recording-quality',priority:'数据范围',title:quality.truncated?'采样记录已截断':'旧记录的采样完整性未知',evidence:quality.truncated?'录制达到容量上限，部分画面、事件或单位资料未保存；已收到的结算统计仍单独显示。':'此记录未保存截断标记，无法确认当时是否遗漏了采样。',action:'只分析已有证据；没有记录到某个事件，不能证明它没有发生。'});
  if(quality.gaps.length)advice.push({id:'recording-gap',priority:'数据范围',title:'记录视角不完整',evidence:'发生过重连、服务端接管或观看其他战场；缺少画面不能证明事件没有发生。',action:'结论限于已有统计和事件，恢复后重打的战斗需单独比较。'});
  return citeAdvice(record,{seconds,totals,rows,advice,quality});
}
export function compareBattles(a,b) {
  const x=analyzeBattle(a), y=analyzeBattle(b);
  const delta=k=>x.totals[k]==null||y.totals[k]==null?null:y.totals[k]-x.totals[k];
  // V1 does not record enough provenance to establish a controlled experiment.
  // A matching seed alone cannot certify identical engines, content or inputs.
  const p=a.provenance,q=b.provenance,valid=p=>p&&/^[a-f0-9]{64}$/.test(p.engineHash)&&/^[a-f0-9]{64}$/.test(p.dataHash)&&p.scenario&&['mode','difficulty','stageId'].every(k=>typeof p.scenario[k]==='string'&&p.scenario[k]);
  const sameScenario=a.version===2&&b.version===2&&valid(p)&&valid(q)&&JSON.stringify(p.scenario)===JSON.stringify(q.scenario)&&p.engineHash===q.engineHash&&p.dataHash===q.dataHash&&p.cs===q.cs&&Number.isInteger(a.seed)&&a.seed===b.seed&&a.round===b.round&&a.kind===b.kind&&JSON.stringify(a.challenge)===JSON.stringify(b.challenge);
  return {sameScenario,comparison:sameScenario?'matching-context':'descriptive',reason:sameScenario?'已记录的引擎、规则和场景一致；仍需核对阵容和操作，差异不能单独证明因果。':'引擎、内容或场景身份缺失/不同，仅描述统计差异。',
    damage:delta('damage'), healing:delta('healing'), leaks:delta('leaks'), deaths:delta('deaths'), seconds:x.seconds===null||y.seconds===null?null:y.seconds-x.seconds};
}
export function coachPayload(record) {
  const analysis=analyzeBattle(record);
  const references=modelEvidence(analysis).map(({localId,...entry})=>entry);
  // Deliberately omit nickname, reconnect tokens, raw saves and network addresses.
  return {version:2,round:record.round,kind:record.kind,summaryOnly:!!record.summaryOnly,quality:analysis.quality,references,
    analysis:{source:analysis.source,seconds:analysis.seconds,totals:analysis.totals,rows:analysis.rows.slice(0,30).map(({name,dmg,heal,taken,attacks,kills,dps})=>({name,dmg,heal,taken,attacks,kills,dps}))},
    task:'用中文给出不超过五条有证据的战术建议。区分事实与推测；不要编造技能机制或胜率。'};
}
