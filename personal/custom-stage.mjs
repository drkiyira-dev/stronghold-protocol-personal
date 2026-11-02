import {contentHashOf, canonicalJson} from '../upstream/shared/plugins/identity.js';
import {sha256Hex} from '../upstream/shared/sha256.js';

export const ORIGINAL_STAGE_ID = 'rainfall-defense';
export function validateStageDescriptor(stage) {
  const namespace = typeof stage?.id === 'string' ? stage.id.replaceAll('-', '_') : '';
  if (stage?.format !== 'stronghold-original-stage' || stage.version !== 1 || !/^[a-z0-9][a-z0-9-]{1,31}$/.test(stage.id) ||
      !/^\d+\.\d+\.\d+$/.test(stage.release) || !stage.modeId?.startsWith(`mode_x_${namespace}_`) || !stage.stageId?.startsWith(`stage_x_${namespace}_`) ||
      !Number.isInteger(stage.seed) || stage.seed < 1 || stage.seed > 0xffffffff || !Number.isInteger(stage.rounds) || stage.rounds < 1 || stage.rounds > 9 ||
      !Number.isInteger(stage.maxLeaks) || stage.maxLeaks < 0 || stage.maxLeaks > 100 ||
      !['rain','none'].includes(stage.environment?.kind) || !/^#[0-9a-f]{6}$/i.test(stage.environment?.tint || '') ||
      !Number.isInteger(stage.environment?.maxParticles) || stage.environment.maxParticles < 0 || stage.environment.maxParticles > 24 ||
      stage.savePolicy !== 'disabled' || !stage.name?.zh || !stage.name?.en ||
      JSON.stringify(stage.compatibleVersions) !== '["act2autochess"]') throw new Error('Unsupported original-stage configuration');
  return stage;
}

/** Static equivalent of the upstream checked content routes, for the local host.
 * The page and battle Worker use upstream loadContentSet/contentFor unchanged.
 */
export async function loadOriginalStage(fetcher = fetch) {
  const abort = new AbortController(), timer = setTimeout(() => abort.abort(), 60000);
  try {
  const read = async (url, pin) => {
    const response = await fetcher(url, {signal:abort.signal});
    if (!response.ok) throw new Error(`Original-stage resource unavailable: ${url} (${response.status})`);
    const text = await response.text();
    if (pin && (new TextEncoder().encode(text).length !== pin.bytes || sha256Hex(text) !== pin.sha256)) throw new Error('Original-stage resource checksum mismatch');
    return JSON.parse(text);
  };
  const descriptor = validateStageDescriptor(await read('/personal/stages/rainfall-defense.json'));
  if (descriptor.id !== ORIGINAL_STAGE_ID) throw new Error('Unknown bundled original stage');
  if (!/^[a-f0-9]{64}$/.test(descriptor.cs)) throw new Error('Original-stage content identity missing');
  const prefix = `/cs/${descriptor.cs.slice(0, 16)}/`;
  const index = await read(prefix + 'index.json');
  if (index.cs !== descriptor.cs || index.vanilla !== false || index.scripts || index.execution) throw new Error('Only the bundled data-only stage is supported');
  const hashes = section => Object.fromEntries(Object.entries(section || {}).map(([name, f]) => [name, f.sha256]));
  const i18n = hashes(index.i18n);
  if (contentHashOf({app:index.app, sim:index.sim, data:hashes(index.data), plugins:index.plugins, settings:index.settings,
    ...(Object.keys(i18n).length ? {i18n} : {}), ...(index.rules ? {rules:index.rules} : {})}) !== descriptor.cs) throw new Error('Original-stage manifest checksum mismatch');
  const data = {};
  // Intentionally serial; keep download/parse pressure low on this local worker.
  for (const [name, pin] of Object.entries(index.data)) {
    if (!(pin.url.startsWith('/data/') || pin.url.startsWith(prefix)) || pin.url.includes('..')) throw new Error('Original-stage resource outside its content set');
    data[name] = await read(pin.url, pin);
  }
  // Goals and seed are content, too: they live in the namespaced stage record
  // and therefore participate in the upstream content hash and replay identity.
  const pinned = validateStageDescriptor(data.stages?.[descriptor.stageId]?.options?.originalStage);
  const {cs, plugin, ...advertised} = descriptor;
  if (canonicalJson(pinned) !== canonicalJson(advertised)) throw new Error('Original-stage metadata checksum mismatch');
  return {descriptor, data};
  } finally {clearTimeout(timer);}
}

/** The upstream normal-wave loop has no finite non-Boss completion policy.
 * Add only the declared challenge boundary AFTER its real LP/kill settlement.
 * All combat, routes, economy, timers and skills remain upstream-owned.
 */
export function installStageObjective(match, descriptor, onProgress = () => {}) {
  match.personalStage = descriptor;
  // These inherited setup hints describe an unreachable Boss round, not this
  // finite patrol. Clear only the custom match's briefing/result labels.
  match.bossId = null; match.hiddenBossId = null;
  const next = match.afterSettle.bind(match);
  match.afterSettle = () => {
    const leaks = match.order[0].stats.leaks;
    onProgress({round:match.round, leaks});
    if (leaks > descriptor.maxLeaks) return match.finish({victory:false, reason:'defeat'});
    if (match.alivePlayers().length && match.round >= descriptor.rounds) return match.finish({victory:true, reason:'victory'});
    return next();
  };
}

export function stageResult(message, descriptor) {
  if (message.t !== 'm.result') return message;
  // Upstream's result assumes the final round is a Boss. Keep its actual stats,
  // outcome and lineup; label this finite challenge's round count and no reward.
  const roundsPassed = message.victory ? descriptor.rounds : Math.min(descriptor.rounds, message.roundsPassed);
  return {...message, roundsPassed, personalStage:descriptor,
    players:message.players.map(p => ({...p, roundsPassed, trophies:0, reward:0}))};
}

// Newly recorded original stages are not legacy matches. Keep their per-assault
// recordings as the default review instead of importing a misleading summary.
export function isOriginalStageRecord(record) {
  return Array.isArray(record?.content?.plugins) && record.content.plugins.some(p=>
    typeof p==='string' ? p.startsWith(ORIGINAL_STAGE_ID+'@') : p?.id===ORIGINAL_STAGE_ID);
}
