// Local-only static preview. No production changes, game commands, asset proxy or injected game state.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
export async function startStagePreview({port=0}={}){
  const root=resolve('dist');
  const html=async()=>(await readFile(root+'/index.html','utf8')).replace('</head>',`<script>let p={};try{p=JSON.parse(localStorage.getItem('sp.pref.settings')||'{}')}catch{};localStorage.setItem('sp.pref.settings',JSON.stringify({...p,muted:true,prepDeployFold:false}));</script></head>`);
  const mime={'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript','.json':'application/json','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.ico':'image/x-icon','.woff2':'font/woff2','.wasm':'application/wasm'};
  const server=createServer(async(req,res)=>{
    try{
      if(!['GET','HEAD'].includes(req.method)){res.writeHead(405).end();return;}
      const url=new URL(req.url,'http://localhost'),file=resolve(root,'.'+decodeURIComponent(url.pathname));
      if(file!==root&&!file.startsWith(root+'/'))throw Error('path');
      const body=url.pathname==='/'?await html():await readFile(file);
      res.writeHead(200,{'Content-Type':url.pathname==='/'?'text/html':mime[extname(file)]||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',
        'Content-Security-Policy':"default-src 'self' data: blob:; script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:; style-src 'self' 'unsafe-inline'"});
      res.end(req.method==='HEAD'?undefined:body);
    }catch{res.writeHead(404).end('Not found');}
  });
  await new Promise(r=>server.listen(port,'127.0.0.1',r));
  return {url:`http://127.0.0.1:${server.address().port}`,close:()=>new Promise(r=>{server.closeIdleConnections();server.close(r);})};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  const app=await startStagePreview({port:4185});console.log(app.url);
  for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>app.close().then(()=>process.exit()));
}
