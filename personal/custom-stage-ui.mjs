import {html} from '/js/ui/components.js';
import {data} from '/js/data.js';
import {getLang} from '/shared/i18n.js';
const english=()=>/^en/i.test(getLang());
export function originalStageFor(modeId){
  if(!modeId?.startsWith('mode_x_rainfall_defense_'))return null;
  return Object.values(data.get('stages')||{}).find(s=>s.options?.originalStage?.modeId===modeId)?.options.originalStage||null;
}
export function originalStageInfo(stage){
  const en=english();return {name:stage.name[en?'en':'zh'],code:'RD-01',rounds:stage.rounds,hidden:false,
    desc:stage.description[en?'en':'zh'],effects:en?
      [`Unofficial original stage · seed ${stage.seed}`,`Survive ${stage.rounds} assaults with at most ${stage.maxLeaks} leaks and LP remaining.`, 'Stage saves disabled; your standard save is retained. No official rewards.']:
      [`非官方原创关卡 · 固定种子 ${stage.seed}`,`守过 ${stage.rounds} 轮，累计漏敌不超过 ${stage.maxLeaks} 且生命未耗尽。`,'本关不存档，标准存档保留；不发放原版奖励。']};
}
export function OriginalStageBriefing({stage}){
  const info=originalStageInfo(stage);
  return html`<section class="brief-enemies personal-stage-brief"><h3 class="brief-h">${english()?'ORIGINAL STAGE // INDUSTRIAL PERIMETER':'原创关卡 // 工业设施防线'}</h3>
    <h2>${info.name}</h2><p>${info.desc}</p><ul>${info.effects.map(s=>html`<li key=${s}>${s}</li>`)}</ul>
    <p>${english()?'Upper and lower gates converge at the central corridor. Guard the choke or split your defence. No Boss round.':'上下入口在中部廊道汇流，可集中守住交汇口，也可分守两路。本关没有 Boss 回合。'}</p></section>`;
}
