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
