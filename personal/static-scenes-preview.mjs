// Independent localhost preview: files only, plus a QA report sink. No room/asset proxy.
import {createServer} from 'node:http';
import {cp,mkdir,readFile,writeFile,stat} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
export async function startStaticPreview({port=0}={}){
  const root=resolve('.cache/static-scenes-preview');await mkdir(root,{recursive:true});
  await cp('dist',root,{recursive:true});
  const html=(await readFile(root+'/index.html','utf8')).replace('</body>','<script type="module" src="/static-scenes-probe.mjs"></script></body>');
  await writeFile(root+'/index.html',html);
  await cp('personal/static-scenes-probe.mjs',root+'/static-scenes-probe.mjs');
  let probes=[];try{const audit=JSON.parse(await readFile('.cache/verification/scene-static-source-audit.json'));probes=audit.headers.filter(r=>['converted scene JSON','converted board texture'].includes(r.label)).map(({label,url})=>({label,url}));}catch{}
  await writeFile(root+'/static-source-probes.json',JSON.stringify(probes));
  const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.wasm':'application/wasm'};
  let result=null;const requests=[];
  const server=createServer(async(req,res)=>{
    const path=new URL(req.url,'http://localhost').pathname;
    if(path==='/__static-result'&&req.method==='POST'){
      let body='';for await(const c of req){body+=c;if(body.length>100000){res.writeHead(413);res.end();return;}}
      try{result=JSON.parse(body);await mkdir('.cache/verification',{recursive:true});await writeFile(`.cache/verification/static-scenes-${result.ua?.includes('Chrome')?'chrome':'safari'}.json`,JSON.stringify({...result,requests},null,2));res.end('ok');}catch{res.writeHead(400);res.end();}return;
    }
    if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
    if(path.startsWith('/assets/'))requests.push({path});
    try{
      const file=resolve(root,'.'+decodeURIComponent(path==='/'?'/index.html':path));
      if(!file.startsWith(root+'/'))throw Error('path');
      const info=await stat(file);if(!info.isFile())throw Error('file');
      const body=await readFile(file);
      res.writeHead(200,{'Content-Type':types[extname(file)]||(path==='/healthz'?'application/json':'application/octet-stream'),'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});res.end(req.method==='HEAD'?undefined:body);
    }catch{res.writeHead(404,{'Cache-Control':'no-store'});res.end('Not found');}
  });
  await new Promise(r=>server.listen(port,'127.0.0.1',r));
  return {root,url:`http://127.0.0.1:${server.address().port}`,result:()=>result,requests,close:()=>new Promise(r=>server.close(r))};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  const app=await startStaticPreview({port:4179});console.log(app.url+'/?board=3d');
  for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>app.close().then(()=>process.exit()));
}
