// Tiny selector metadata only; the image bytes are read from the official external stylesheet.
export const STATS_CSS='https://web.hycdn.cn/arknights/webview/act1autochess.41668e.css';
const selectors={titleMask:'.WqPlp7',countGlow:'.zrK7_e:before',recordLabel:'.D_liCN .C8cb_l .grJEuP',recordFunds:'.D_liCN .C8cb_l:first-child .QjacBn',recordPromotions:'.D_liCN .C8cb_l:nth-child(2) .QjacBn',recordDefeats:'.D_liCN .C8cb_l:nth-child(3) .QjacBn',strategyTopFrame:'.MjyVeP .oetJsV',bondTopFrame:'.zJvtrR',achievementBondFrame:'.vMxx75 .QjacBn',headingIconFrame:'.d55Z07 .YhjRsw',headingIcon:'.d55Z07 .YhjRsw:after',achievementElite1:'.MLjcnT .E1AGEa .UuPuiA[data-value="1"]',achievementItemSlot:'.MLjcnT .yREPMr .uMnwgg .qgW2SX',strategyBadgeFrame:'.jDhW1o',strategyBadge:'.jDhW1o.GajVs2:after'};
for(let i=1;i<=6;i++){selectors[`memberTier${i}`]=`.X3pmNU .V1837J[data-value="${i}"]`;selectors[`achievementTier${i}`]=`.MLjcnT .ykHBSj[data-value="${i}"]`;}
export function extractStatsImages(css){
  const rules=[...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)],out={};
  for(const [key,selector] of Object.entries(selectors)){
    const rule=rules.find(m=>m[1].includes(selector));
    const value=rule?.[2].match(/url\(["']?(data:[^\s)"']+)["']?\)/)?.[1];
    if(value&&/^data:image\/(png|svg\+xml);base64,/.test(value))out[key]=value;
  }
  return out;
}
export function applyStatsImages(value,images){
  if(typeof value==='string'&&value.startsWith(STATS_CSS+'#personal='))return images[value.split('#personal=')[1]] || '';
  if(Array.isArray(value))return value.map(x=>applyStatsImages(x,images));
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,x])=>[k,applyStatsImages(x,images)]));
  return value;
}
