// Reuse upstream's verified importer, Cache Storage and service worker. No art is uploaded.
export const SCENE_IMPORT_URL='/personal/scene-import.json';
export async function cachedSceneManifest(manifest,cache){
  const groups={};
  if(!cache)return {groups};
  for(const [name,entries]of Object.entries(manifest?.groups||{})){
    const available={};
    for(const [key,entry]of Object.entries(entries)){
      if(!/^\/assets\/~[a-f0-9]{16}\/local\//.test(entry?.path||''))continue;
      const response=await cache.match(entry.path);
      if(response?.ok)available[key]=entry;
    }
    // A cancelled import must not advertise an incomplete geometry pair.
    if(/^scene\/act/.test(name)&&(!available.scene||!available.bin))continue;
    if(Object.keys(available).length)groups[name]=available;
  }
  return {groups};
}

export async function installSceneImports(){
  const {registerImportedAssetWorker,IMPORTED_ASSET_CACHE}=await import('/js/assetCache.js');
  try{
    if(!await registerImportedAssetWorker())return;
    if(!navigator.serviceWorker.controller)await new Promise(resolve=>{
      const done=()=>{clearTimeout(timer);navigator.serviceWorker.removeEventListener('controllerchange',done);resolve();};
      const timer=setTimeout(done,2500);navigator.serviceWorker.addEventListener('controllerchange',done);
      if(navigator.serviceWorker.controller)done();
    });
  }catch{return;}
  const original=globalThis.fetch.bind(globalThis);
  let catalog;
  globalThis.fetch=async(input,init)=>{
    const url=new URL(typeof input==='string'||input instanceof URL?String(input):input.url,location.href);
    const response=await original(input,init);
    if(url.origin!==location.origin||url.pathname!=='/data/local-assets.json'||!response.ok||
      (init?.method||(input instanceof Request?input.method:'GET'))!=='GET'||!navigator.serviceWorker.controller)return response;
    try{
      catalog ||= original(SCENE_IMPORT_URL,{cache:'no-cache'}).then(r=>r.ok?r.json():{groups:{}}).catch(()=>({groups:{}}));
      const imported=await cachedSceneManifest(await catalog,await caches.open(IMPORTED_ASSET_CACHE));
      if(!Object.keys(imported.groups).length)return response;
      const served=await response.clone().json(),groups={...served.groups};
      for(const [name,entries]of Object.entries(imported.groups))groups[name]={...groups[name],...entries};
      return new Response(JSON.stringify({...served,groups}),{headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
    }catch{return response;}
  };
}
