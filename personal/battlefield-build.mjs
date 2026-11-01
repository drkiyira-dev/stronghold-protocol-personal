import { replaceContract as replace } from './build-identity.mjs';

export function adaptBattlefieldView(source) {
  source = "import { BattlefieldAtmosphere } from '/personal/battlefield-atmosphere.mjs';\nimport { menuVisuals } from '/personal/visual-state.mjs';\nimport { fxAtlas } from './textures.js';\n" + source;
  source = replace(source, '  setupCleanup.push(() => tiles.destroy());', `  setupCleanup.push(() => tiles.destroy());
  const atmosphere = new BattlefieldAtmosphere({ P, tiles, layer: layers.anim, textures: () => fxAtlas().tex,
    preferences: menuVisuals, settings: () => settings, canvas: app.view, available: () => !app.renderer.context?.isLost });
  setupCleanup.push(() => atmosphere.destroy());`, 'battlefield atmosphere ownership');
  source = replace(source, '      if (board3d) {\n        if (board3d.lost)', `      atmosphere.step(dt, { official: !!board3d?.official, ended: mode === 'battle' && presentation.ended });
      if (board3d) {
        if (board3d.lost)`, 'existing field ticker');
  source = replace(source, 'board3d.render(cam, clock);', 'board3d.render(cam, clock, atmosphere.clock);', 'shared terrain shader clock');
  source = replace(source, '      tiles.update(dt);', '      tiles.update(dt, atmosphere.clock);\n      atmosphere.draw(cam);', 'shared terrain sprite clock');
  source = replace(source, '      try { tiles.destroy(); } catch', '      atmosphere.destroy();\n      try { tiles.destroy(); } catch', 'release atmosphere with field');
  return replace(source, '        buffered: interp.size, camera: cam.params(),',
    '        buffered: interp.size, camera: cam.params(), environment: atmosphere.stats(),', 'measurable atmosphere resources');
}
export function adaptTerrainClock(source) {
  source = replace(source, '  update(dt) {\n    this.time += dt;\n    const t = this.time;',
    '  update(dt, ambientTime = this.time + dt) {\n    this.time += dt;\n    this.ambientTime = ambientTime;\n    const t = ambientTime;', 'separate cosmetic and event clocks');
  return replace(source, '    const t = this.time;\n    for (const { r, c, gate, g } of this.boxes)',
    '    const t = this.ambientTime ?? this.time;\n    for (const { r, c, gate, g } of this.boxes)', 'static gate pulse with live leak flashes');
}
export function adaptSceneClock(source) {
  source = replace(source, '  render(cam, t = 0) {', '  render(cam, t = 0, ambientTime = t) {', 'optional scene cosmetic clock');
  for (const name of ['start', 'end', 'endAb']) source = replace(source,
    `gatePulse(t, GATE_TINT.${name}.alpha)`, `gatePulse(ambientTime, GATE_TINT.${name}.alpha)`, 'scene gate pulse '+name);
  source = replace(source, "for (const k of ['water', 'mire', 'infection', 'smog']) this.mat[k].uniforms.uTime.value = t;",
    "for (const k of ['water', 'mire', 'infection', 'smog']) this.mat[k].uniforms.uTime.value = ambientTime;", 'reuse procedural scene shaders');
  return replace(source, 'for (const m of this.sceneWater || []) m.uniforms.uTime.value = t;',
    'for (const m of this.sceneWater || []) m.uniforms.uTime.value = ambientTime;', 'reuse imported scene shaders');
}
export const BATTLEFIELD_ADAPTERS = [
  ['js/render/app.js', adaptBattlefieldView], ['js/render/tiles.js', adaptTerrainClock],
  ['js/render/board3d/scene.js', adaptSceneClock],
];

export const BATTLEFIELD_TRANSLATIONS = {
  ja: {
    '动态环境效果': '環境アニメーション',
    '沿用画面质量控制首页、大厅与战场环境。低档或静态关闭非必要环境动画；技能、伤害与战斗规则不变。': '画質設定はタイトル、ロビー、戦場の環境に共通です。低画質または静止モードでは装飾的な環境アニメーションを停止します。スキル、ダメージ、戦闘ルールは変わりません。',
    '系统已开启减少动态效果，当前暂停非必要环境动画。': 'システムの動きを減らす設定に従い、装飾的な環境アニメーションを停止しています。',
  },
  ko: {
    '动态环境效果': '환경 애니메이션',
    '沿用画面质量控制首页、大厅与战场环境。低档或静态关闭非必要环境动画；技能、伤害与战斗规则不变。': '기존 화질 설정이 타이틀, 로비, 전장 환경에 적용됩니다. 낮음 또는 정적 모드에서는 장식용 환경 애니메이션이 꺼집니다. 스킬, 피해량, 전투 규칙은 바뀌지 않습니다.',
    '系统已开启减少动态效果，当前暂停非必要环境动画。': '시스템의 동작 줄이기 설정에 따라 장식용 환경 애니메이션이 일시 중지되었습니다.',
  },
  'zh-TW': {
    '动态环境效果': '動態環境效果',
    '沿用画面质量控制首页、大厅与战场环境。低档或静态关闭非必要环境动画；技能、伤害与战斗规则不变。': '沿用畫面品質控制首頁、大廳與戰場環境。低檔或靜態關閉非必要環境動畫；技能、傷害與戰鬥規則不變。',
    '系统已开启减少动态效果，当前暂停非必要环境动画。': '系統已開啟減少動態效果，目前暫停非必要環境動畫。',
  },
};
