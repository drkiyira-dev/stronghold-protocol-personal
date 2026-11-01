import { useLayoutEffect, useRef } from '/vendor/hooks.module.js';
import { html, MicroLabel } from '/js/ui/components.js';
import { HubMotes } from '/js/ui/hubScene.js';
import { mediaStore } from '/js/ui/lobbyMedia.js';
import { useStore } from '/js/store.js';
import { t } from '/shared/i18n.js';
import { menuVisuals, setMenuMotion, useMenuPolicy } from './visual-state.mjs';

export function VisualSettings() {
  const s = useStore(x => x, Object.is, menuVisuals);
  return html`<section class="menu-visual-settings" aria-label=${t('动态环境效果')}>
    <div class="set-row">
      <span class="set-row__label">${t('动态环境效果')}<${MicroLabel}>VISUAL MOTION<//></span>
      <div class="set-seg" role="radiogroup" aria-label=${t('动态环境效果')}>
        ${[[true, '动态'], [false, '静态']].map(([value, label]) => html`<button type="button" role="radio"
          aria-checked=${String(s.motion === value)} class=${s.motion === value ? 'is-on' : ''}
          data-menu-motion-choice=${String(value)} onClick=${() => setMenuMotion(value)}>${t(label)}</button>`)}
      </div>
    </div>
    <p class="set-hint">${t('沿用画面质量控制首页、大厅与战场环境。低档或静态关闭非必要环境动画；技能、伤害与战斗规则不变。')}</p>
    ${s.reduced ? html`<p class="set-hint" role="status">${t('系统已开启减少动态效果，当前暂停非必要环境动画。')}</p>` : null}
    ${!s.saved ? html`<p class="set-hint" role="status">${t('浏览器未能保存此设置，本次页面仍然生效。')}</p>` : null}
  </section>`;
}

/** Reuses upstream's seeded motes and CSS, behind all controls. No extra art requests. */
export function MenuAtmosphere({ scene }) {
  const p = useMenuPolicy(), ref = useRef(null);
  const ownScene = useStore(s => s.prefs.scene !== 'official' || !!(s.prefs.backdrop && s.backdrop), Object.is, mediaStore);
  const visible = scene === 'title' || !ownScene;
  useLayoutEffect(() => {
    const background = ref.current?.parentElement;
    const screen = background?.closest('.screen');
    if (!screen || !p.parallax || !visible) return;
    let frame = 0, x = 0, y = 0;
    const paint = () => {
      frame = 0;
      background.style.setProperty('--menu-x', `${x.toFixed(2)}px`);
      background.style.setProperty('--menu-y', `${y.toFixed(2)}px`);
    };
    const move = event => {
      if (event.pointerType !== 'mouse') return;
      const box = screen.getBoundingClientRect();
      x = Math.max(-1, Math.min(1, (event.clientX - box.x) / Math.max(1, box.width) * 2 - 1)) * 7;
      y = Math.max(-1, Math.min(1, (event.clientY - box.y) / Math.max(1, box.height) * 2 - 1)) * 5;
      if (!frame) frame = requestAnimationFrame(paint);
    };
    const reset = () => { if (frame) cancelAnimationFrame(frame); frame = 0; x = y = 0; paint(); };
    screen.addEventListener('pointermove', move, { passive: true });
    screen.addEventListener('pointerleave', reset);
    return () => {
      screen.removeEventListener('pointermove', move);
      screen.removeEventListener('pointerleave', reset);
      if (frame) cancelAnimationFrame(frame);
      background.style.removeProperty('--menu-x'); background.style.removeProperty('--menu-y');
    };
  }, [p.parallax, visible]);
  if (!visible) return null;
  return html`<div ref=${ref} class=${`menu-atmosphere menu-atmosphere--${scene}`} aria-hidden="true">
    <div class="menu-light menu-light--far"></div><div class="menu-light menu-light--near"></div>
    <div class="menu-horizon"></div>
    ${p.particles ? html`<${HubMotes} limit=${p.particles} />` : null}
  </div>`;
}
