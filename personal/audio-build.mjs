// Adapt the existing upstream mixer; no second AudioContext, event engine or audio bank.
import {replaceContract as replace} from './build-identity.mjs';

export function adaptAudio(source) {
  const patch=(a,b,label)=>{source=replace(source,a,b,'audio: '+label);};
  patch('this.sfxGain = null;', 'this.sfxGain = null;\n    this.uiGain = null;\n    this.uiLastAt = -Infinity;','UI bus');
  patch('this.sfxGain = this.ctx.createGain();','this.sfxGain = this.ctx.createGain();\n      this.uiGain = this.ctx.createGain();\n      this.uiGain.connect(this.master);','UI routing');
  patch('bgm: 0.6, sfx: 0.8, voice: 0.8','bgm: 0.6, sfx: 0.8, uiSfx: 0.8, voice: 0.8','defaults');
  patch('sfx: n(v?.sfx, this.volumes.sfx),','sfx: n(v?.sfx, this.volumes.sfx),\n      uiSfx: n(v?.uiSfx, this.volumes.uiSfx),','volumes');
  patch('this.sfxGain.gain.setTargetAtTime(this.volumes.sfx ** 2 * 0.9, t, 0.03);',
    'this.sfxGain.gain.setTargetAtTime(this.volumes.sfx ** 2 * 0.9, t, 0.03);\n      this.uiGain.gain.setTargetAtTime(this.volumes.uiSfx ** 2 * 0.9, t, 0.03);','UI gain');
  // Only the generic UI path is changed. Unit/battle pools, voice priorities,
  // landing limits, mute, context unlocking and PCM budgets remain upstream's.
  patch('if (!this.ctx || !url || this.volumes.muted || this.volumes.sfx <= 0) return;\n    if (limited && pool)',
    'if (!this.ctx || !url || this.volumes.muted || (limited ? this.volumes.sfx : this.volumes.uiSfx) <= 0) return;\n    if (limited && pool)','channel mute');
  patch('else if (this.uiVoices >= 12) return;\n    else this.uiVoices += 1;',
    `else {
      // [ASSUMED] Presentation guards: four pending/playing UI cues, 70 ms apart.
      if (this.uiVoices >= 4 || now - this.uiLastAt < 70) return;
      this.uiLastAt = now; this.uiVoices += 1;
    }`,'UI burst guard');
  patch('if (!buf || !this.ctx) { release(); return; }',
    `if (!buf || !this.ctx || this.volumes.muted || (limited ? this.volumes.sfx : this.volumes.uiSfx) <= 0
        || (!limited && performance.now() - now > 450)) { release(); return; }`,'discard stale cold UI cues');
  patch('s.connect(g); g.connect(this.sfxGain);\n        let done = false;',
    's.connect(g); g.connect(limited ? this.sfxGain : this.uiGain);\n        let done = false;','play route');
  // Bond cues are shared by prep and battle; route their existing scope too.
  const start=source.indexOf('  _playBondCue('),end=source.indexOf('\n  /**',start);
  const old=source.slice(start,end);
  const updated=old.replaceAll('this.volumes.sfx <= 0',"(scope === 'battle' ? this.volumes.sfx : this.volumes.uiSfx) <= 0")
    .replace('gain.connect(this.sfxGain)',"gain.connect(scope === 'battle' ? this.sfxGain : this.uiGain)");
  patch(old,updated,'bond scope');
  patch('if (this.volumes.muted || this.volumes.sfx <= 0) this.stopBondCue();',
    "if (this.volumes.muted || (this.bondCueScope === 'battle' ? this.volumes.sfx : this.volumes.uiSfx) <= 0) this.stopBondCue();",'bond mute');
  return source;
}

export function adaptAudioSettings(source) {
  return replace(source,'sfx: vol(r.sfx, DEFAULT_SETTINGS.sfx),',
    'sfx: vol(r.sfx, DEFAULT_SETTINGS.sfx),\n    uiSfx: vol(r.uiSfx, vol(r.sfx, DEFAULT_SETTINGS.sfx)),','legacy sound preference migration');
}

export function adaptAudioSettingsUI(source) {
  source=replace(source,"<${Slider} label=${t('音效')} micro=\"SFX\" icon=\"signal\" value=${s.sfx}",
    `<\${Slider} label=\${t('界面音效')} micro="UI SFX" icon="signal" value=\${s.uiSfx}
        onInput=\${(v) => { updateSettings({ uiSfx: v }); audio.sfx('click'); }} />
      <\${Slider} label=\${t('战斗音效')} micro="BATTLE SFX" icon="signal" value=\${s.sfx}`,'separate audio sliders');
  return replace(source,"audio.sfx('click'); } }} />", "audio.battle('deploy'); } }} />",'battle preview');
}

export const AUDIO_LABELS={en:['Interface sounds','Battle sounds'],ja:['UI効果音','戦闘効果音'],ko:['UI 효과음','전투 효과음'],'zh-TW':['介面音效','戰鬥音效']};
