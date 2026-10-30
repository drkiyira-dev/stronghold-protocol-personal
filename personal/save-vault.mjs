// Crash-safe, versioned PREP save storage. Never interprets a combat frame as a save.
import {sha256Hex} from '../upstream/shared/sha256.js';
import {checkpointRunId,validRunId} from './run-identity.mjs';

export const LEGACY_SAVE_KEY = 'stronghold.personal.prep.v1';
export const VAULT_KEYS = ['stronghold.personal.vault.2.a', 'stronghold.personal.vault.2.b'];
export const RECOVERY_KEY = 'stronghold.personal.vault.2.recovery';
const MAX_BYTES = 1800000;
const MAX_SAVES = 18;
const clone = value => JSON.parse(JSON.stringify(value));
const empty = () => ({version: 2, revision: 0, activeId: null, saves: []});
export function inspectSave(snapshot) {
  if (!snapshot || snapshot.kind !== 'stronghold-solo-prep' || snapshot.version !== 1 ||
      typeof snapshot.engine !== 'string' || typeof snapshot.dataFingerprint !== 'string' ||
      !Number.isInteger(snapshot.round) || snapshot.round < 1 || snapshot.options?.mode !== 'solo' ||
      !snapshot.options?.seats?.[0]?.playerId || !snapshot.state) throw new Error('不是有效的休整存档');
  if (JSON.stringify(snapshot).length > 900000) throw new Error('存档过大');
  if (snapshot.runId !== undefined && !validRunId(snapshot.runId)) throw new Error('存档对局身份无效');
  return snapshot;
}
function signed(payload) { const body = JSON.stringify(payload); return JSON.stringify({kind:'stronghold-save-vault', body, checksum:sha256Hex(body)}); }
function unpack(raw) {
  if (typeof raw !== 'string' || raw.length > MAX_BYTES) throw new Error('存档文件为空或过大');
  const envelope = JSON.parse(raw);
  if (envelope.kind === 'stronghold-solo-prep') return {legacy:inspectSave(envelope)};
  if (envelope.kind !== 'stronghold-save-vault' || typeof envelope.body !== 'string' || sha256Hex(envelope.body) !== envelope.checksum) throw new Error('存档校验失败，原文件不会被覆盖');
  const payload = JSON.parse(envelope.body);
  if (payload.version !== 2) throw new Error('暂不支持此存档容器版本，请保留原文件');
  if (!Number.isInteger(payload.revision) || payload.revision < 0 || !Array.isArray(payload.saves) || payload.saves.length > MAX_SAVES) throw new Error('存档目录损坏');
  const ids = new Set();
  for (const save of payload.saves) {
    inspectSave(save.snapshot);
    if (typeof save.id !== 'string' || ids.has(save.id) || typeof save.runId !== 'string' || !Number.isFinite(save.at)) throw new Error('存档条目损坏');
    if (save.runId !== checkpointRunId(save.snapshot)) throw new Error('存档对局身份不一致');
    ids.add(save.id);
  }
  if (payload.activeId !== null && !ids.has(payload.activeId)) throw new Error('活动存档缺失');
  return payload;
}
export function saveCompatibility(snapshot, current) {
  if (!current) return {ok:false, reason:'正在读取引擎版本'};
  if (snapshot.engine !== current.engine) return {ok:false, reason:'引擎版本不同，已保留原存档，可导出备用'};
  if (snapshot.dataFingerprint !== current.dataFingerprint) return {ok:false, reason:'规则数据版本不同，已保留原存档，可导出备用'};
  return {ok:true, reason:'可恢复至休整阶段'};
}
export function createSaveVault(storage, {now = Date.now} = {}) {
  let state = empty();
  let warning = '';
  let blocked = false;
  const candidates = [];
  for (const key of VAULT_KEYS) {
    try { const raw = storage.getItem(key); if (raw) candidates.push(unpack(raw)); }
    catch { warning = '检测到损坏或不可读取的存档副本；有效副本和原数据均已保留。'; }
  }
  const valid = candidates.filter(v => v.version === 2).sort((a,b) => b.revision-a.revision);
  if (valid.length) state = valid[0];
  else if (warning) blocked = true;
  function refresh() {
    for (const key of VAULT_KEYS) {
      try {const raw=storage.getItem(key);if(!raw)continue;const value=unpack(raw);if(value.version===2&&value.revision>state.revision)state=value;} catch {}
    }
  }
  function commit(next) {
    if (blocked) throw new Error('存档副本均不可读取；为保护原数据，自动写入已停止。请先导出备份。');
    next.revision = state.revision + 1;
    const raw = signed(next);
    if (raw.length > MAX_BYTES) throw new Error('存档空间已满，请导出备份；旧存档未被覆盖');
    const key = VAULT_KEYS[next.revision % 2];
    storage.setItem(key, raw); // Atomic setItem; the other journal remains intact on failure.
    if (storage.getItem(key) !== raw) throw new Error('存档写入校验失败，旧副本仍保留');
    state = next;
  }
  function save(snapshot, {manual = false, label = '', activate = true} = {}) {
    refresh();
    inspectSave(snapshot);
    const runId = checkpointRunId(snapshot);
    const id = sha256Hex(JSON.stringify([runId,snapshot.state,snapshot.challenge || null])).slice(0,24);
    const next = clone(state);
    const item = {id, runId, at:now(), manual, label:String(label).slice(0,80), snapshot:clone(snapshot)};
    const previous = next.saves.find(s => s.id === id);
    if (previous?.manual) item.manual = true;
    next.saves = [item, ...next.saves.filter(s => s.id !== id)];
    let sameRun = 0;
    next.saves = next.saves.filter(s => s.manual || s.runId !== runId || ++sameRun <= 3);
    while (next.saves.length > MAX_SAVES) {
      const index = next.saves.findLastIndex(s => !s.manual && s.id !== id);
      if (index < 0) throw new Error('手动备份数量已满，请先导出备份');
      next.saves.splice(index, 1);
    }
    if(activate)next.activeId = id;
    commit(next);
    return clone(item);
  }
  if (!valid.length && !blocked) {
    try { const raw = storage.getItem(LEGACY_SAVE_KEY); if (raw) save(inspectSave(JSON.parse(raw)), {label:'从旧版迁移'}); }
    catch (error) { warning = `旧版存档已保留：${error.message}`; }
  }
  return {
    list: () => {refresh();return clone(state.saves);},
    active: () => {refresh();return clone(state.saves.find(s => s.id === state.activeId)?.snapshot || null);},
    warning: () => warning,
    save,
    select(id) {
      refresh();
      const next = clone(state);
      if (!next.saves.some(s => s.id === id)) throw new Error('存档不存在');
      next.activeId = id; commit(next); return this.active();
    },
    complete(snapshot) {if(!snapshot)return;refresh();const active=state.saves.find(s=>s.id===state.activeId);if(!active||active.runId!==checkpointRunId(snapshot))return;const next = clone(state); next.activeId = null; commit(next); },
    export: () => {refresh();return signed(state);},
    exportRaw: () => JSON.stringify(Object.fromEntries([...VAULT_KEYS, LEGACY_SAVE_KEY, RECOVERY_KEY].map(k => [k, storage.getItem(k)]))),
    import(raw) {
      refresh();
      const incoming = unpack(raw);
      if(blocked){
        // Explicit import can repair the vault only after preserving both unreadable originals.
        const previous=storage.getItem(RECOVERY_KEY);
        const preserved=JSON.stringify({previous,at:now(),journals:Object.fromEntries(VAULT_KEYS.map(k=>[k,storage.getItem(k)]))});
        storage.setItem(RECOVERY_KEY,preserved);
        if(storage.getItem(RECOVERY_KEY)!==preserved)throw new Error('无法备份损坏副本，已取消修复');
        blocked=false;warning='已用导入文件恢复；损坏副本保留在原始恢复数据中。';
      }
      if (incoming.legacy) return save(incoming.legacy, {manual:true, label:'导入旧版存档'});
      const next = clone(state);
      const entries = new Map(next.saves.map(s => [s.id,s]));
      for (const item of incoming.saves) if (!entries.has(item.id)) entries.set(item.id, {...item, manual:true});
      if (entries.size > MAX_SAVES) throw new Error('合并后备份超过 18 个；请导入单个休整存档');
      next.saves = [...entries.values()].sort((a,b) => b.at-a.at);
      next.activeId = state.activeId || incoming.activeId;
      commit(next); return this.active();
    },
    exportOne: id => {
      const item = state.saves.find(s => s.id === id);
      if (!item) throw new Error('存档不存在');
      return signed({version:2, revision:0, activeId:id, saves:[item]});
    },
  };
}
