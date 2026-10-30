// Personal, browser-local PREP checkpoints for the unmodified upstream engine.
// Only quiescent, untimed, one-human vanilla matches are supported. Combat resumes
// from the last PREP, never from a display snapshot or an incomplete battle state.
import { Match } from '../upstream/server/match/Match.js';
import { getData } from '../upstream/server/data.js';
import { createRng } from '../upstream/server/sim/rng.js';
import { collectViolations } from '../upstream/server/match/invariants.js';

const KIND = 'stronghold-solo-prep';
const ENGINE = 'stronghold-protocol-0.3.3/prep-v1';
const TAG = '$blackshoreCheckpoint';
const RNG_NAMES = ['rngSetup', 'rngShop', 'rngWaves', 'rngDraft', 'rngBots', 'rngMeta'];
const MATCH_FIELDS = [
  'stageId', 'factions', 'bossId', 'hiddenBossId', 'disabledBonds', 'staticInactiveBonds', 'bannedChess',
  'round', 'uidSeq', 'setupRevision', 'draft', 'sp', 'wave', 'bossWaves', 'bossPairs', 'bossPairsRound',
  'lastResults', 'uniteResultView', 'teamLp', 'hiddenLayerSum', 'hiddenReached',
  '_battleSeq', 'battlePrefix', 'pausedMs', 'offerSeq',
];
const OPTION_FIELDS = [
  'roomCode', 'mode', 'difficulty', 'modeId', 'seed', 'matchNo', 'hostId', 'aiPicksLast', 'soloUnlimited',
  'cs', 'vs', 'requireCs', 'kitted', 'rules', 'offers', 'version',
];
const PLAYER_EXCLUDE = new Set(['m', 'gd', '_diyRecords', 'diyStock', '_deployMap', '_lastPriv', '_prepScoutSig']);
const PLATFORM_FIELDS = new Set(['send', 'broadcast', 'onEnd', 'data', 'scheduler', 'now', 'log']);
const fingerprints = new WeakMap();

function fail(message) { throw new TypeError(`休整存档：${message}`); }
function own(object, key) { return Object.prototype.hasOwnProperty.call(object, key); }
function plain(value) { return value && typeof value === 'object' && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null); }

// Encode Maps/Sets and non-finite diagnostic timestamps without JSON's lossy
// conversion. Reject functions/classes/cycles instead of silently dropping state.
function encode(value, visiting = new Set()) {
  if (value === undefined) return { [TAG]: 'undefined' };
  if (typeof value === 'number' && !Number.isFinite(value)) return { [TAG]: String(value) };
  if (value === null || ['string', 'boolean', 'number'].includes(typeof value)) return value;
  if (typeof value !== 'object') fail('包含不可保存的运行状态');
  if (visiting.has(value)) fail('包含循环运行引用');
  visiting.add(value);
  let result;
  if (value instanceof Map) result = { [TAG]: 'map', entries: [...value].map(([k, v]) => [encode(k, visiting), encode(v, visiting)]) };
  else if (value instanceof Set) result = { [TAG]: 'set', entries: [...value].map(v => encode(v, visiting)) };
  else if (Array.isArray(value)) result = value.map(v => encode(v, visiting));
  else if (plain(value)) {
    if (own(value, TAG)) fail('不支持的存档字段');
    result = Object.fromEntries(Object.entries(value).map(([k, v]) => [k, encode(v, visiting)]));
  } else fail(`包含不可保存的 ${value.constructor?.name || '对象'}`);
  visiting.delete(value);
  return result;
}
function decode(value, depth = 0) {
  if (depth > 100) fail('数据嵌套过深');
  if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) return value;
  if (Array.isArray(value)) return value.map(v => decode(v, depth + 1));
  if (!plain(value)) fail('格式损坏');
  if (own(value, TAG)) {
    switch (value[TAG]) {
      case 'undefined': return undefined;
      case 'Infinity': return Infinity;
      case '-Infinity': return -Infinity;
      case 'NaN': return NaN;
      case 'map':
        if (!Array.isArray(value.entries) || value.entries.some(e => !Array.isArray(e) || e.length !== 2)) fail('Map 格式损坏');
        return new Map(value.entries.map(([k, v]) => [decode(k, depth + 1), decode(v, depth + 1)]));
      case 'set':
        if (!Array.isArray(value.entries)) fail('Set 格式损坏');
        return new Set(value.entries.map(v => decode(v, depth + 1)));
      default: fail('未知的数据编码');
    }
  }
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, decode(v, depth + 1)]));
}
function fingerprint(data) {
  if (!data || typeof data !== 'object') fail('游戏数据不可用');
  if (fingerprints.has(data)) return fingerprints.get(data);
  // Every gameplay table; art manifests are deliberately excluded. This is a
  // compatibility check, not an authentication/security hash.
  const names = ['config', 'chess', 'bonds', 'garrisons', 'items', 'bands', 'effects', 'choices', 'enemies', 'factions', 'waves', 'stages', 'bosses', 'tokens', 'backups'];
  let hash = 2166136261;
  for (const name of names) {
    const str = JSON.stringify([name, data[name] ?? null]);
    for (let i = 0; i < str.length; i++) hash = Math.imul(hash ^ str.charCodeAt(i), 16777619) >>> 0;
  }
  const result = hash.toString(16).padStart(8, '0');
  fingerprints.set(data, result);
  return result;
}
function assertCapturable(m) {
  if (!m || m.phase !== 'PREP' || m.ended || m.disposed) fail('仅可保存休整期');
  if (!m.isSolo || m.order.length !== 1 || m.order[0].isBot || m.order[0].autoplay || !m.order[0].alive || m.order[0].left) fail('仅支持一位玩家手动操作的独立模拟');
  if (!m.soloUntimed || m.deadline || m.order[0].ready || m._prepEndQueued) fail('休整阶段尚未稳定');
  if (m.fields.length || m.runner || m.bossPool || m.externalAI || m.test || m.requireCs || m.offerWin.length || m.offers.length) fail('当前扩展或运行状态不支持存档');
  if (m.dispatcher.depth || m.order[0]._deferItemMerge || m._rehearsalTasks.size) fail('请等待当前操作完成');
  const violations = collectViolations(m);
  if (violations.length) fail(`局面校验未通过：${violations[0]}`);
}

export function captureCheckpoint(match) {
  assertCapturable(match);
  const ps = match.order[0];
  const options = {};
  for (const key of OPTION_FIELDS) if (match.opts[key] !== undefined) options[key] = match.opts[key];
  Object.assign(options, {
    roomCode: match.roomCode, mode: 'solo', difficulty: match.difficulty, modeId: match.modeId, seed: match.seed,
    hostId: ps.playerId,
    seats: [{ seat: ps.seat, playerId: ps.playerId, name: ps.name, isBot: false, connected: true,
      loadout: ps.loadout, ops: ps.ops, notOwned: ps.standIns, diy: ps.diy, skins: ps.skins }],
    timerScale: match.timerScale, combatSpeed: match.gameSpeed, clientCombat: match.clientCombat,
    verify: match.verifyMode, battleContent: match.battleContent, botStrategy: match.bot.id,
    botRehearsal: match.botRehearsal, botRehearsalDelegate: match.botRehearsalDelegate,
    botRehearsalDelegateMs: match.botRehearsalDelegateMs,
  });
  if (Number.isFinite(match.botSliceMs)) options.botSliceMs = match.botSliceMs;
  if (Number.isFinite(match.headlessSliceMs)) options.headlessSliceMs = match.headlessSliceMs;
  const player = {};
  for (const [key, value] of Object.entries(ps)) if (!PLAYER_EXCLUDE.has(key)) player[key] = value;
  const savedAt = match.sched.now();
  return {
    kind: KIND, version: 1, engine: ENGINE, dataFingerprint: fingerprint(match.data),
    savedAt, elapsedMs: Math.max(0, savedAt - match.startedAt), round: match.round,
    options: JSON.parse(JSON.stringify(options)),
    state: encode({
      match: Object.fromEntries(MATCH_FIELDS.filter(k => own(match, k)).map(k => [k, match[k]])),
      player, poolEntries: match.pool.entries, itemDebt: match.itemPool.debt, diyEntries: ps.diyStock.entries,
      factionSchedule: match.factions.schedule,
      rng: Object.fromEntries(RNG_NAMES.map(name => [name, match[name].state()])),
    }),
  };
}

export function validateCheckpoint(snapshot, data = getData()) {
  if (!plain(snapshot) || snapshot.kind !== KIND || snapshot.version !== 1 || snapshot.engine !== ENGINE) fail('存档版本不兼容');
  if (snapshot.dataFingerprint !== fingerprint(data)) fail('存档使用了不同版本的游戏数据');
  if (!plain(snapshot.options) || snapshot.options.mode !== 'solo' || !Array.isArray(snapshot.options.seats) || snapshot.options.seats.length !== 1) fail('玩家配置无效');
  const seat = snapshot.options.seats[0];
  if (!plain(seat) || typeof seat.playerId !== 'string' || !seat.playerId || seat.isBot || typeof snapshot.options.roomCode !== 'string') fail('玩家身份无效');
  if (!Number.isFinite(snapshot.savedAt) || !Number.isFinite(snapshot.elapsedMs) || snapshot.elapsedMs < 0 || !Number.isInteger(snapshot.round) || snapshot.round < 1) fail('回合或时间无效');
  if (!Number.isInteger(snapshot.options.seed) || snapshot.options.seed <= 0 || snapshot.options.seed > 0xffffffff) fail('随机种子无效');
  const state = decode(snapshot.state);
  if (!plain(state) || !plain(state.match) || !plain(state.player) || !plain(state.rng)) fail('局面格式无效');
  if (!plain(state.factionSchedule) || !Array.isArray(state.factionSchedule.typeSlots) || !Array.isArray(state.factionSchedule.picks)) fail('敌人波次计划缺失');
  if (state.match.round !== snapshot.round || state.player.playerId !== seat.playerId || state.player.ready || state.player.autoplay || !state.player.alive || state.player.left) fail('不支持的休整局面');
  if (!(state.poolEntries instanceof Map) || !(state.itemDebt instanceof Map) || !(state.diyEntries instanceof Map) || !(state.player.board instanceof Map) || !(state.player._tempDue instanceof Map) || !(state.player._standInSet instanceof Set)) fail('库存或棋盘数据无效');
  if (!Array.isArray(state.player.hand) || !Array.isArray(state.player.temp) || !plain(state.player.shop)) fail('整备区数据无效');
  for (const name of RNG_NAMES) if (!Number.isInteger(state.rng[name]) || state.rng[name] < 0 || state.rng[name] > 0xffffffff) fail('随机数状态无效');
  for (const key of Object.keys(state.match)) if (!MATCH_FIELDS.includes(key)) fail('未知的对局字段');
  for (const key of Object.keys(state.player)) if (PLAYER_EXCLUDE.has(key) || ['__proto__', 'constructor', 'prototype'].includes(key)) fail('不支持的玩家字段');
  return true;
}
function rngAt(state) {
  // createRng(0) means its default seed; advance the preceding state once to
  // recover the perfectly valid internal state zero without changing upstream.
  if (state !== 0) return createRng(state);
  const rng = createRng((-0x6d2b79f5) >>> 0); rng(); return rng;
}

export function restoreCheckpoint(snapshot, platformOverrides = {}) {
  for (const key of Object.keys(platformOverrides)) if (!PLATFORM_FIELDS.has(key)) fail(`平台不能覆盖 ${key}`);
  const data = platformOverrides.data ?? getData();
  validateCheckpoint(snapshot, data);
  const state = decode(snapshot.state);
  const opts = { ...snapshot.options, ...platformOverrides, data, journal: false, externalAI: null };
  if (typeof opts.send !== 'function' || typeof opts.broadcast !== 'function' || typeof opts.onEnd !== 'function') fail('需要消息和结算回调');
  const m = new Match(opts);
  try {
    for (const [key, value] of Object.entries(state.match)) m[key] = value;
    // The upstream factions array carries a non-enumerable pre-drawn schedule.
    // Array JSON alone loses it and makes subsequent waves consume new draws.
    if (state.factionSchedule) Object.defineProperty(m.factions, 'schedule', { value: Object.freeze(state.factionSchedule), enumerable: false });
    m.stage = m.gd.stage(m.stageId);
    if (!m.stage) fail('战场不存在');
    m.pool.entries = state.poolEntries;
    m.pool.banned = m.bannedChess.slice();
    m.itemPool.debt = state.itemDebt;
    const ps = m.order[0];
    for (const [key, value] of Object.entries(state.player)) ps[key] = value;
    ps.diyStock.entries = state.diyEntries;
    ps.connected = true;
    // Derived tile cache is rebuilt without recompute()/onActiveBonds, which
    // could grant a milestone again. Existing computed bonds are restored intact.
    ps._deployField = m.deployFieldOf(ps);
    ps._deployMap = m.deployMapFor(ps, ps._deployField);
    ps._legalityStale = false;
    ps._lastPriv = null;
    for (const name of RNG_NAMES) m[name] = rngAt(state.rng[name]);
    m.phase = 'PREP';
    m.deadline = 0;
    m.overtimeAt = 0;
    m.startedAt = m.sched.now() - snapshot.elapsedMs;
    if (Number.isFinite(ps.lastEmoteAt)) ps.lastEmoteAt += m.sched.now() - snapshot.savedAt;
    assertCapturable(m);
    m.markPrivate(ps);
    m.markPublic();
    return m;
  } catch (error) {
    m.dispose();
    throw error;
  }
}
