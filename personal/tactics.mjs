// Evidence-based coaching; no model inference or invented win probabilities.
const n = value => Number.isFinite(value) ? Math.max(0,value) : 0;
export function analyzeBattle(record) {
  const players = Object.entries(record.result?.perPlayer || {});
  const owned = players.filter(([id]) => !record.selfId || id === record.selfId);
  const chosen = owned.length ? owned : players;
  const seconds = n(record.result?.time) || n(record.frames?.at(-1)?.t);
  const meta = Object.values(record.units || {});
  const rows = chosen.flatMap(([owner,p]) => (p.unitStats || []).map(u => ({
    ...u, owner, name:meta.find(m => m.uid === u.uid && m.ownerId === owner)?.name || record.names?.[u.defId] || u.defId,
    dmg:n(u.dmg), heal:n(u.heal), taken:n(u.taken), attacks:n(u.attacks), kills:n(u.kills),
    dps:seconds ? n(u.dmg)/seconds : 0,
  }))).sort((a,b) => b.dmg-a.dmg || b.heal-a.heal);
  const totals = chosen.reduce((a,[,p]) => ({damage:a.damage+n(p.damageDealt),healing:a.healing+n(p.healingDone),deaths:a.deaths+n(p.deaths),leaks:a.leaks+(p.leaked || []).filter(x=>x.counted!==false).length}), {damage:0,healing:0,deaths:0,leaks:0});
  if (record.summary) for(const key of Object.keys(totals))totals[key]=Number.isFinite(record.summary[key])?n(record.summary[key]):null;
  const advice = [];
  const unused = rows.filter(u => u.kind === 'op' && !u.attacks && !u.dmg && !u.heal);
  if (unused.length) advice.push({id:'coverage',priority:'重点',title:'检查攻击覆盖与朝向',evidence:`${unused.map(u=>u.name).slice(0,5).join('、')}在本场的攻击、伤害和治疗均为 0。`,action:'复盘这些干员与敌人路线的相对位置；首领战优先确认攻击范围能覆盖首领。辅助或阻挡干员可能仍有贡献，不能据此直接判定无效。'});
  if (totals.leaks) advice.push({id:'leaks',priority:'重点',title:'优先处理漏敌位置',evidence:`本场记录了 ${totals.leaks} 个计入结算的漏敌。`,action:'跳转到漏敌事件，检查阻挡数量、敌人移动路线和远程火力覆盖；每次只调整一处，比较下一次结果。'});
  if (totals.deaths) advice.push({id:'survival',priority:'重点',title:'检查前排生存与治疗覆盖',evidence:`本场有 ${totals.deaths} 次己方死亡，记录治疗量 ${Math.round(totals.healing)}。`,action:'对照首个阵亡事件检查承伤集中情况。调整部署顺序和医疗范围；不能被友方治疗的干员需要其他生存手段。'});
  if (n(record.preparation?.funds) > 0) advice.push({id:'funds',priority:'经济',title:'休整资金可提前规划',evidence:`准备就绪时仍有 ${record.preparation.funds} 资金。`,action:'剩余资金会在休整结束清零。下一回合先比较升级、补充阵容、装备与刷新收益，再准备就绪。'});
  const deployed = n(record.preparation?.deployed), cap = n(record.preparation?.cap);
  if (cap > deployed && n(record.preparation?.bench) > 0) advice.push({id:'capacity',priority:'布阵',title:'还有部署容量可用',evidence:`记录到 ${deployed}/${cap} 个已部署席位，整备区仍有干员。`,action:'检查是否有可合法部署、能激活盟约或覆盖遗漏路线的候选干员。挑战规则可能限制实际可用人数。'});
  if (!advice.length && (rows.length || record.summary)) advice.push({id:'stable',priority:'复盘',title:'保留这次配置作为比较基准',evidence:`当前记录：伤害 ${totals.damage==null?'未记录':Math.round(totals.damage)}、漏敌 ${totals.leaks??'未记录'}、己方死亡 ${totals.deaths??'未记录'}。`,action:'导出本次记录，再在同一种子挑战中只改变一个站位、技能或装备，比较输出与生存；这些数据不等同于未来胜率。'});
  if (!rows.length) advice.push({id:'limited',priority:'数据范围',title:'这份记录只有汇总数据',evidence:record.summaryOnly ? '旧版战绩未保存逐秒画面和干员级伤害。' : '尚未收到完整的干员级结算数据。',action:'从此版本开始完成一场战斗后，可以查看时间轴、关键事件和干员输出排名。'});
  return {source:'local-rules-v1',seconds,totals,rows,advice};
}
export function compareBattles(a,b) {
  const x=analyzeBattle(a), y=analyzeBattle(b);
  const delta=k=>x.totals[k]==null||y.totals[k]==null?null:y.totals[k]-x.totals[k];
  return {sameScenario: Number.isInteger(a.seed) && a.seed === b.seed && a.round === b.round && a.kind === b.kind && JSON.stringify(a.challenge)===JSON.stringify(b.challenge),
    damage:delta('damage'), healing:delta('healing'), leaks:delta('leaks'), deaths:delta('deaths'), seconds:y.seconds-x.seconds};
}
export function coachPayload(record) {
  const analysis=analyzeBattle(record);
  // Deliberately omit nickname, reconnect tokens, raw saves and network addresses.
  return {version:1,round:record.round,kind:record.kind,seed:record.seed,summaryOnly:!!record.summaryOnly,
    analysis:{...analysis,rows:analysis.rows.slice(0,30).map(({name,dmg,heal,taken,attacks,kills,dps})=>({name,dmg,heal,taken,attacks,kills,dps}))},
    task:'用中文给出不超过五条有证据的战术建议。区分事实与推测；不要编造技能机制或胜率。'};
}
