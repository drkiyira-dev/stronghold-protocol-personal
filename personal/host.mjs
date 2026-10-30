import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {access,readFile} from 'node:fs/promises';
import {startServer} from '../upstream/server/index.js';
import {createCoachHandler} from './coach-service.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
export async function startPersonalServer(options={}){
  const publicDir=options.publicDir || path.join(root,'dist');
  await access(path.join(publicDir,'index.html')).catch(()=>{throw new Error('Build the client first: npm run build');});
  const coach=createCoachHandler(options.coach || {});
  const index=JSON.parse(await readFile(path.join(publicDir,'personal/external-assets.json'),'utf8'));
  const origins=new Set(Object.values(index.files).flat().filter(u=>u.startsWith('https://')).map(u=>new URL(u).origin));
  const extra=(process.env.PERSONAL_CONNECT_ORIGINS||'').split(',').filter(Boolean).map(u=>{const v=new URL(u.trim());if(!['https:','http:','wss:','ws:'].includes(v.protocol)||v.username||v.password)throw new Error('Invalid PERSONAL_CONNECT_ORIGINS');return v.origin;});
  const app=await startServer({host:'127.0.0.1',port:4174,publicDir,dataDir:path.join(publicDir,'data'),sharedDir:path.join(publicDir,'shared'),packsDir:path.join(publicDir,'packs'),pluginsDir:path.join(root,'plugins'),studio:false,assetIndex:false,versions:{enabled:['act2autochess'],default:'act2autochess'},...options});
  const handlers=app.server.listeners('request');app.server.removeAllListeners('request');
  app.server.on('request',(req,res)=>{
    if(['/', '/index.html'].includes(req.url.split('?')[0])){
      const set=res.setHeader.bind(res);
      res.setHeader=(name,value)=>{
        if(name.toLowerCase()==='content-security-policy')value=String(value).replace(/(img-src|media-src|font-src|connect-src) ([^;]+)/g,(whole,directive,sources)=>`${directive} ${sources} ${[...origins,...(directive==='connect-src'?extra:[])].join(' ')}`);
        return set(name,value);
      };
    }
    coach(req,res).then(handled=>{if(!handled)for(const handler of handlers)handler.call(app.server,req,res);}).catch(()=>{if(!res.headersSent)res.writeHead(500);res.end();});
  });
  return app;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2),opts={};
  for(let i=0;i<args.length;i++){if(args[i]==='--host')opts.host=args[++i];else if(args[i]==='--port')opts.port=Number(args[++i]);else throw new Error(`Unknown argument: ${args[i]}`);}
  if(opts.port!==undefined&&(!Number.isInteger(opts.port)||opts.port<1||opts.port>65535))throw new Error('Port must be 1–65535');
  const app=await startPersonalServer(opts);
  console.log(`\nPersonal room server: ${app.url}/?server=local\nLAN: use --host 0.0.0.0 and open http://YOUR_LAN_IP:${app.port}/?server=local on each device.\nServer state is held by this running process; this is not original-site account sync.\n`);
  for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>app.close().then(()=>process.exit(0)));
}
