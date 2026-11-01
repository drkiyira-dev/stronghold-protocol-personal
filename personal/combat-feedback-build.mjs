import { replaceContract as replace } from './build-identity.mjs';

export function adaptCombatFeedback(source) {
  source = "import { CombatFeedback } from '/personal/combat-feedback.mjs';\n" + source;
  // menuVisuals is imported by the preceding battlefield adapter.
  source = replace(source, '  ctx.fx = fx;', `  ctx.fx = fx;
  const combatFeedback = new CombatFeedback({ tiles, preferences: menuVisuals, settings: () => settings,
    canvas: app.view, available: () => !app.renderer.context?.isLost });
  setupCleanup.push(() => combatFeedback.destroy());`, 'combat feedback lifecycle');
  source = replace(source, '    prepPieces = list.filter((e) => e.key && views.has(e.key));',
    `    combatFeedback.prep(list, e => {
      const t = pieceTile(e);
      return t && boardWorld(t.row, t.col, e.area === 'hand' || e.area === 'temp');
    }, editable);
    prepPieces = list.filter((e) => e.key && views.has(e.key));`, 'confirmed prep feedback');
  for (const anchor of ['    stageRec = st;', '    ctx.myPlayerId = id;', '    presentation.reset();', '  function enterPrepMode() {']) {
    source = replace(source, anchor, anchor + '\n    combatFeedback.reset();', 'feedback reset: ' + anchor.trim());
  }
  const skill = '        if (v) { const custom = pluginFx.skill(v, !!e[2]); v.setSkill?.(!!e[2]); if ((!wiring.skill(v, !!e[2]) && !custom) || !e[2]) fx.skill(v, !!e[2]); }';
  source = replace(source, skill, `        if (v) {
          const custom = pluginFx.skill(v, !!e[2]); v.setSkill?.(!!e[2]);
          const official = wiring.skill(v, !!e[2]);
          if ((!official && !custom) || !e[2]) fx.skill(v, !!e[2]);
          combatFeedback.skill(v, !!e[2], { handled: !!(official || custom), late: LATE.has(e) });
        }`, 'real skill event feedback');
  source = replace(source, '      tiles.update(dt, atmosphere.clock);',
    "      combatFeedback.step(dt, mode === 'battle' && presentation.ended);\n      tiles.update(dt, atmosphere.clock);", 'feedback existing frame');
  source = replace(source, '      atmosphere.destroy();', '      combatFeedback.destroy();\n      atmosphere.destroy();', 'feedback teardown');
  return replace(source, 'environment: atmosphere.stats(),', 'combatFeedback: combatFeedback.stats(), environment: atmosphere.stats(),', 'feedback diagnostics');
}

export function adaptCombatUnderframe(source) {
  // Re-key only the decorative SVG when selection changes. Action buttons keep
  // their focus, pointer handlers and original busy/disabled semantics.
  return replace(source, '<svg class="uframe__dia"', '<svg key=${uid} class="uframe__dia"', 'selection decoration identity');
}

export const COMBAT_ADAPTERS = [
  ['js/render/app.js', adaptCombatFeedback], ['js/ui/underframe.js', adaptCombatUnderframe],
];
