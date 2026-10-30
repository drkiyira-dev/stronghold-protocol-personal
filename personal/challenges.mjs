export const CHALLENGE_KIND = 'stronghold-personal-challenge';
const ID = /^[a-zA-Z0-9_-]{1,80}$/;
export const CHALLENGE_PRESETS = [
  {kind:CHALLENGE_KIND, version:1, id:'four-at-the-gate', name:'四人防线', description:'最多部署四名干员，用站位与技能配合完成标准模拟。', seed:20261030, difficulty:'FUNNY', rules:{maxDeploy:4,noRefresh:false,noEquipment:false,bannedOperators:[]}},
  {kind:CHALLENGE_KIND, version:1, id:'first-offer', name:'既定补给', description:'禁止刷新商店，围绕每回合发到手中的资源构建阵容。', seed:20261031, difficulty:'FUNNY', rules:{maxDeploy:8,noRefresh:true,noEquipment:false,bannedOperators:[]}},
];
export function validateChallenge(value, chess = null) {
  if (!value || value.kind !== CHALLENGE_KIND || value.version !== 1) throw new Error('不支持的挑战包版本');
  if (!ID.test(value.id) || typeof value.name !== 'string' || !value.name.trim() || value.name.length > 80) throw new Error('挑战标识或名称无效');
  if (typeof value.description !== 'string' || value.description.length > 600) throw new Error('挑战说明过长');
  if (!Number.isInteger(value.seed) || value.seed < 1 || value.seed > 0xffffffff) throw new Error('种子必须是 1–4294967295 的整数');
  if (!['FUNNY','NORMAL','HARD','ABYSS'].includes(value.difficulty)) throw new Error('不支持的难度');
  const rules = value.rules;
  if (!rules || !Number.isInteger(rules.maxDeploy) || rules.maxDeploy < 1 || rules.maxDeploy > 10 || typeof rules.noRefresh !== 'boolean' || typeof rules.noEquipment !== 'boolean') throw new Error('挑战规则无效');
  if (!Array.isArray(rules.bannedOperators) || rules.bannedOperators.length > 200 || rules.bannedOperators.some(id => !ID.test(id) || (chess && !chess[id]))) throw new Error('禁用干员列表无效');
  const allowed = new Set(['kind','version','id','name','description','seed','difficulty','rules']);
  if (Object.keys(value).some(k => !allowed.has(k)) || Object.keys(rules).some(k => !['maxDeploy','noRefresh','noEquipment','bannedOperators'].includes(k))) throw new Error('挑战包含未支持字段；此接口不执行脚本');
  return JSON.parse(JSON.stringify(value));
}
export function challengeViolation(challenge, message, player) {
  if (!challenge || !player) return null;
  const r = challenge.rules;
  if (message.t === 'g.refresh' && r.noRefresh) return '本挑战禁止刷新商店';
  if (['g.equip','g.art'].includes(message.t) && r.noEquipment) return '本挑战禁止使用装备和战术道具';
  if(message.t==='g.ready'&&message.ready){
    const units=[...player.board.values()].filter(p=>p?.kind==='chess');
    if(units.length>r.maxDeploy)return `本挑战最多部署 ${r.maxDeploy} 名干员`;
    if(units.some(p=>r.bannedOperators.includes(p.id)))return '请撤下本挑战禁用的干员';
    if(r.noEquipment&&units.some(p=>p.items?.length))return '请撤下携带装备的干员后再准备就绪';
  }
  if (message.t === 'g.buy') {
    const item = player.shop?.slots?.[message.slot];
    if (item && r.bannedOperators.includes(item.id)) return '此干员被挑战规则禁用';
    if (item?.kind === 'item' && r.noEquipment) return '本挑战禁止购买装备';
  }
  if (message.t === 'g.move' && message.to?.area === 'board') {
    const board = [...player.board.values()];
    const piece = [...board,...player.hand,...player.temp].find(p => p?.uid === message.uid);
    if (piece && r.bannedOperators.includes(piece.id)) return '此干员被挑战规则禁用';
    const already = board.some(p => p?.uid === message.uid);
    const occupied = player.board.get(`${message.to.row},${message.to.col}`)?.kind === 'chess';
    if (piece?.kind==='chess' && !already && !occupied && board.filter(p => p?.kind === 'chess').length >= r.maxDeploy) return `本挑战最多部署 ${r.maxDeploy} 名干员`;
  }
  return null;
}
