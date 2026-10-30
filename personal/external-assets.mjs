import {normalizeAtlas} from '../upstream/tools/assets/atlas.mjs';
import {safeName} from '../upstream/tools/assets/sources.mjs';
import {STATS_CSS,extractStatsImages,applyStatsImages} from './stats-external.mjs';
export async function installExternalAssets(){
  const original=globalThis.fetch.bind(globalThis),response=await original('/personal/external-assets.json');
  if(!response.ok)throw new Error('外部素材索引加载失败');
  const manifest=await response.json(),byUrl=new Map();
  let statsPromise;
  const stats=()=>statsPromise ||= original(STATS_CSS,{signal:AbortSignal.timeout(10000)}).then(r=>{if(!r.ok)throw new Error('stats stylesheet');return r.text();}).then(extractStatsImages).catch(()=>({}));
  for(const urls of Object.values(manifest.files))for(const url of urls)byUrl.set(new URL(url,location.href).href,urls);
  globalThis.fetch=async(input,init)=>{
    const url=new URL(typeof input==='string'||input instanceof URL?String(input):input.url,location.href).href;
    const parsed=new URL(url);
    if(parsed.origin===location.origin&&parsed.pathname.endsWith('/assets.json')){
      const result=await original(input,init);if(!result.ok)return result;
      return new Response(JSON.stringify(applyStatsImages(await result.json(),await stats())),{headers:{'Content-Type':'application/json'}});
    }
    const candidates=byUrl.get(url);
    if(!candidates || (init?.method || (input instanceof Request?input.method:'GET'))!=='GET')return original(input,init);
    let last;
    for(const candidate of [url,...candidates.filter(x=>x!==url)]){
      if(init?.signal?.aborted)throw init.signal.reason;
      try{
        const signal=init?.signal || (input instanceof Request?input.signal:null);
        const timeout=AbortSignal.timeout(15000);
        const result=await original(input instanceof Request?new Request(candidate,input):candidate,{...init,signal:signal?AbortSignal.any([signal,timeout]):timeout,credentials:'omit'});
        if(!result.ok){await result.body?.cancel();last=new Error(`素材请求失败：${result.status}`);continue;}
        const metadata=manifest.atlas[url];
        if(!metadata)return result;
        const raw=await result.text(),normalized=normalizeAtlas(raw,{pma:metadata.pma,pageSize:name=>metadata.sizes[safeName(name)] || null});
        if(normalized.missingSize.length)throw new Error('模型贴图尺寸元数据缺失');
        return new Response(normalized.text,{headers:{'Content-Type':'text/plain; charset=utf-8'}});
      }catch(e){last=e;}
    }
    throw last || new Error('外部素材暂不可用');
  };
  const tried=new WeakMap();
  document.addEventListener('error',event=>{
    const el=event.target;if(!(el instanceof HTMLImageElement))return;
    const urls=byUrl.get(el.currentSrc || el.src);if(!urls)return;
    const seen=tried.get(el)||new Set();seen.add(el.currentSrc || el.src);tried.set(el,seen);
    const next=urls.find(u=>!seen.has(u));if(next)el.src=next;
  },true);
}
