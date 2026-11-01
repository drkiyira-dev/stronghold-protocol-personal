import {build} from 'esbuild';
import {cp, mkdir, writeFile, readFile, readdir, rm} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {buildIdentity,replaceContract,verifyNoUntrackedEngineFiles} from './build-identity.mjs';
import {adaptAudio,adaptAudioSettings,adaptAudioSettingsUI,AUDIO_LABELS} from './audio-build.mjs';
import {adaptMapShadow} from './maps-build.mjs';
import {loadSceneCatalog,sceneManifest} from './scene-assets.mjs';
import {adaptSceneImport,adaptSceneTiles} from './scene-imports-build.mjs';
import {publishLicenses} from './licenses-build.mjs';
import {vendor,VENDOR_FILES} from '../upstream/tools/vendor.mjs';
import {writeArtifactManifest} from './artifact-integrity.mjs';
import {VISUAL_ADAPTERS,VISUAL_EN} from './visuals-build.mjs';
import {BATTLEFIELD_ADAPTERS,BATTLEFIELD_TRANSLATIONS} from './battlefield-build.mjs';
import {COMBAT_ADAPTERS} from './combat-feedback-build.mjs';
const identity=await buildIdentity();
await verifyNoUntrackedEngineFiles();
const root = fileURLToPath(new URL('../', import.meta.url));
const dist = path.join(root, 'dist');
// A reused node_modules tree does not run upstream's postinstall. Generate its
// browser libraries explicitly, and never let stale output conceal a missing file.
await rm(dist, {recursive:true,force:true});
try {
  const generated=new Set(vendor());
  const missing=VENDOR_FILES.map(([,name])=>name).filter(name=>!generated.has(name));
  if(missing.length)throw new Error('Missing browser libraries: '+missing.join(', '));
} catch(error) {
  throw new Error('Cannot prepare browser dependencies. Run npm --prefix upstream ci --omit=dev, then rebuild.',{cause:error});
}
await mkdir(dist, {recursive:true});
// Art remains external; rebuilding dist never changes the source art cache.
for (const [from,to] of [['public',''],['shared','shared'],['server/sim','sim'],['data','data']]) {
  await cp(path.join(root,'upstream',from), path.join(dist,to), {recursive:true, filter: source => !/(?:\/assets|\/fonts)(?:\/|$)/.test(source)});
}
await cp(path.join(root,'personal/templates'),dist,{recursive:true});
for(const [file,adapt]of [['js/audio.js',adaptAudio],['js/ui/gameLogic/settings.js',adaptAudioSettings],['js/ui/settings.js',adaptAudioSettingsUI],['js/render/app.js',adaptMapShadow]]) {
  const target=path.join(dist,file);await writeFile(target,adapt(await readFile(target,'utf8')));
}
for(const [file,adapt]of [['js/assetPack.js',adaptSceneImport],['js/render/board3d/load.js',adaptSceneTiles],['js/render/boardArt.js',adaptSceneTiles]]){
  const target=path.join(dist,file);await writeFile(target,adapt(await readFile(target,'utf8')));
}
for(const [file,adapt] of [...VISUAL_ADAPTERS,...BATTLEFIELD_ADAPTERS,...COMBAT_ADAPTERS]) {
  const target=path.join(dist,file);await writeFile(target,adapt(await readFile(target,'utf8')));
}
const visualEnglish=path.join(dist,'i18n/en.json');
await writeFile(visualEnglish,JSON.stringify({...JSON.parse(await readFile(visualEnglish,'utf8')),...VISUAL_EN}));
for (const [lang,labels] of Object.entries(BATTLEFIELD_TRANSLATIONS)) {
  const file=path.join(dist,'i18n',lang+'.json');
  await writeFile(file,JSON.stringify({...JSON.parse(await readFile(file,'utf8')),...labels}));
}
const importUI=path.join(dist,'js/ui/assetImport.js');
await writeFile(importUI,replaceContract(await readFile(importUI,'utf8'),'读取自己的素材包，美术不占服务器流量。','本机导入场景素材，建议使用普通窗口；完成后刷新。','scene import hint'));
for(const [lang,labels]of Object.entries(AUDIO_LABELS)) {
  const file=path.join(dist,'i18n',lang+'.json'),pack=JSON.parse(await readFile(file,'utf8'));
  Object.assign(pack,{'界面音效':labels[0],'战斗音效':labels[1],
    '本机导入场景素材，建议使用普通窗口；完成后刷新。':{en:'Use a regular window to import scene art, then reload.',ja:'通常ウィンドウで素材を読み込み後、再読み込みしてください。',ko:'일반 창에서 장면 리소스를 가져온 후 새로 고치세요.','zh-TW':'建議在一般視窗匯入場景素材，完成後重新整理。'}[lang]});await writeFile(file,JSON.stringify(pack));
}
// Keep attribution together at the lower left; reserve existing toolbars for
// the terminal instead of covering the footer or shop with a floating button.
const titleFile=path.join(dist,'js/screens/title.js');
const rightsLine="<span>${t('非官方同人复刻 · 游戏素材版权归 上海鹰角网络 / Yostar 所有')}</span>";
let titleCode=await readFile(titleFile,'utf8');
const footerMeta=titleCode.match(/      <span class="title-foot__meta">[\s\S]*?      <\/span>\n(?=    <\/footer>)/)?.[0];
if(!footerMeta)throw new Error('Upstream title footer changed; review project link placement');
titleCode=replaceContract(titleCode,footerMeta,'','title metadata location');
titleCode=replaceContract(titleCode,rightsLine,'','original title rights location');
// Install/resume/notices controls appear conditionally. Keep attribution first
// in DOM order too, so their arrival cannot displace it to the opposite corner.
titleCode=replaceContract(titleCode,'<footer class="title-foot">',
  `<footer class="title-foot"><div class="project-notice"><p>本项目为非官方、非商业性同人二次创作，与《明日方舟》官方无关。</p>${rightsLine}${footerMeta}</div>`,
  'leftmost title project statement');
await writeFile(titleFile,titleCode);
for(const [file,anchor]of [
  ['js/screens/title.js','<div class="title-corner__tools">'],
  ['js/screens/lobby.js','<div class="topbar__tools">'],
  ['js/screens/game.js','<div class="gm__corner">'],
]){
  const target=path.join(dist,file);
  await writeFile(target,replaceContract(await readFile(target,'utf8'),anchor,
    anchor+'<personal-terminal-slot></personal-terminal-slot>','terminal toolbar: '+file));
}
// Safari can evaluate concurrent dynamic kit imports before tier4's const helpers.
// Initialize that shared dependency first; keep every upstream kit and rule intact.
const kitsFile=path.join(dist,'sim/content/kits/index.js');
await writeFile(kitsFile,replaceContract(await readFile(kitsFile,'utf8'),'export const KIT_FILES =',
  "import './shared/tier4.js';\n\nexport const KIT_FILES =",'Safari kit helper initialization'));
await mkdir(path.join(dist,'personal'),{recursive:true});
const importCatalog=JSON.parse(await readFile(path.join(root,'personal/scene-import-catalog.json'),'utf8'));
await writeFile(path.join(dist,'personal/scene-import.json'),JSON.stringify(importCatalog.manifest));
await writeFile(path.join(dist,'personal/build-info.json'),JSON.stringify(identity));
for (const name of ['local-client.mjs','personal.css','skeleton-codec.mjs','spine-urls.mjs','visual-policy.mjs','visual-state.mjs','visuals.mjs','battlefield-policy.mjs','battlefield-atmosphere.mjs','combat-feedback.mjs']) await cp(path.join(root,'personal',name),path.join(dist,'personal',name));
await writeFile(path.join(dist,'personal/personal.css'),await readFile(path.join(root,'personal/personal.css'),'utf8')+'\n'+await readFile(path.join(root,'personal/visuals.css'),'utf8')+'\n'+await readFile(path.join(root,'personal/combat-feedback.css'),'utf8'));
// Upstream's local-only model validator must recognize the externally hosted assets too.
const assetsFile=path.join(dist,'js/assets.js');
let assetsCode=await readFile(assetsFile,'utf8');
const validator=/export function validSpine\(sp\) \{\n[^\n]+\n\}/;
if(!validator.test(assetsCode))throw new Error('Upstream Spine validator changed; review the external-resource adapter');
assetsCode="import {validPersonalSpine} from '/personal/spine-urls.mjs';\n"+assetsCode.replace(validator,'export function validSpine(sp) { return validPersonalSpine(sp); }');
await writeFile(assetsFile,assetsCode);
await publishLicenses(root,dist);
for (const [file,value] of Object.entries({
  'healthz':{ok:true,build:'personal-1.1.0',content:{plugins:0,notices:false},personal:true},
  'data/local-assets.json':process.env.PERSONAL_SCENE_ORIGIN?sceneManifest(await loadSceneCatalog(),process.env.PERSONAL_SCENE_ORIGIN):{groups:{}},
  'plugins/index.json':{version:1,plugins:[]},
})) {
  await mkdir(path.dirname(path.join(dist,file)),{recursive:true});
  await writeFile(path.join(dist,file),JSON.stringify(value));
}
await mkdir(path.join(dist,'packs'),{recursive:true});
execFileSync(process.execPath,[path.join(root,'upstream/tools/packs.mjs'),'index'],{cwd:path.join(root,'upstream'),stdio:'inherit'});
await cp(path.join(root,'upstream/packs/index.json'),path.join(dist,'packs/index.json'));
await import('./external-assets-build.mjs');
await import('./build-worker.mjs');
// Content names prevent an older open tab from reusing an outdated engine.
for (const name of await readdir(path.join(dist,'personal'))) if (/^local-(server|client)-[a-f0-9]{12}\.(js|mjs)$/.test(name)) await rm(path.join(dist,'personal',name));
const hash = value => createHash('sha256').update(value).digest('hex').slice(0,12);
const workerCode = await readFile(path.join(dist,'personal/local-server.js'));
const workerName = `local-server-${hash(workerCode)}.js`;
await writeFile(path.join(dist,'personal',workerName),workerCode);
let clientCode = await readFile(path.join(dist,'personal/local-client.mjs'),'utf8');
clientCode = clientCode.replace('/personal/local-server.js',`/personal/${workerName}`);
const bundled=await build({stdin:{contents:clientCode,resolveDir:path.join(root,'personal'),sourcefile:'local-client.mjs'},bundle:true,write:false,format:'esm',target:'es2022',external:['/js/*','/sim/*','/shared/*']});
clientCode=bundled.outputFiles[0].text;
const clientName = `local-client-${hash(clientCode)}.mjs`;
await writeFile(path.join(dist,'personal',clientName),clientCode);
let html = await readFile(path.join(dist,'index.html'),'utf8');
html = replaceContract(html,'/personal/local-client.mjs',`/personal/${clientName}`,'client entry');
html = html.replace('/personal/personal.css','/personal/personal.css?v='+hash(await readFile(path.join(dist,'personal/personal.css'))));
await writeFile(path.join(dist,'index.html'),html);
await writeArtifactManifest(dist);
console.log('Personal build ready in dist/');
