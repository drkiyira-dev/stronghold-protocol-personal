import { replaceContract as replace } from './build-identity.mjs';

// Generated-dist seams only: retain upstream rendering, seeded particles and media storage.
export function adaptHubMotes(source) {
  const block = source.match(/html`<div class="hub-bg__motes">[\s\S]*?<\/div>`/)?.[0];
  if (!block) throw new Error('Upstream hub motes changed; review the visual adapter');
  source = replace(source, block, 'html`<${HubMotes} />`', 'shared upstream motes');
  return source + '\nexport function HubMotes({ limit = MOTES.length } = {}) {\n  return '
    + replace(block, 'MOTES.map(', 'MOTES.slice(0, Math.max(0, Math.min(MOTES.length, limit))).map(', 'mote budget') + ';\n}\n';
}
export function adaptVisualTitle(source) {
  return "import { MenuAtmosphere } from '/personal/visuals.mjs';\n" + replace(source,
    '<div class="title-bg__haze"></div>', '<div class="title-bg__haze"></div><${MenuAtmosphere} scene="title" />', 'title atmosphere');
}
export function adaptVisualLobby(source) {
  return "import { MenuAtmosphere } from '/personal/visuals.mjs';\n" + replace(source,
    '<span class="hub-bg__grid"></span>', '<span class="hub-bg__grid"></span><${MenuAtmosphere} scene="lobby" />', 'lobby atmosphere');
}
export function adaptVisualSettings(source) {
  const anchor = '<div class="set-row">\n        <span class="set-row__label">${t(\'画面质量\')}';
  return "import { VisualSettings } from '/personal/visuals.mjs';\n" + replace(source, anchor,
    '<${VisualSettings} />\n      ' + anchor, 'menu visual settings');
}
export function adaptVisualRuntime(source) {
  return "import { VisualRuntime } from '/personal/visual-state.mjs';\n" + replace(source,
    '<div class="app-root">', '<div class="app-root"><${VisualRuntime} />', 'menu visual lifecycle');
}
export function adaptVisualMedia(source) {
  source = "import { useMenuStill } from '/personal/visual-state.mjs';\n" + replace(source,
    'const still = reducedMotion();', 'const still = useMenuStill();', 'own background motion preference');
  source = replace(source, "    const p = v.play?.();\n    if (still) p?.then?.(() => v.pause(), () => {});\n    else p?.catch?.(() => {});",
    "    if (still) { v.pause(); return; }\n    v.play?.()?.catch?.(() => {});\n    return () => v.pause();", 'pause hidden/static user video');
  return replace(source, '}, [bg?.url, on]);', '}, [bg?.url, on, still]);', 'react to live motion changes');
}
export const VISUAL_ADAPTERS = [
  ['js/ui/hubScene.js', adaptHubMotes], ['js/screens/title.js', adaptVisualTitle],
  ['js/screens/lobby.js', adaptVisualLobby], ['js/ui/settings.js', adaptVisualSettings],
  ['js/main.js', adaptVisualRuntime], ['js/ui/lobbyMedia.js', adaptVisualMedia],
];
export const VISUAL_EN = {
  '动态环境效果': 'Environmental motion',
  '沿用画面质量控制首页、大厅与战场环境。低档或静态关闭非必要环境动画；技能、伤害与战斗规则不变。': 'Quality controls menu and battlefield environments. Low or Static disables nonessential environmental animation. Skills, damage and battle rules are unchanged.',
  '系统已开启减少动态效果，当前暂停非必要环境动画。': 'Your system requests reduced motion. Nonessential environmental animation is paused.',
  '菜单动态效果': 'Menu motion', '动态': 'Animated', '静态': 'Static',
  '首页和大厅跟随下方画面质量；低档静态、中档少量粒子、高档增加视差。不影响战斗规则。': 'Menu backgrounds follow quality: low is static, medium adds a few particles, high adds parallax. Battle rules are unchanged.',
  '系统已开启减少动态效果，当前使用静态背景。': 'Your system requests reduced motion. The background is static.',
  '浏览器未能保存此设置，本次页面仍然生效。': 'This browser could not save the preference. It still applies to this page.',
};
