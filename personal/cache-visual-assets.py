import base64, concurrent.futures, json, os, pathlib, threading, time, urllib.parse, urllib.request
ROOT=pathlib.Path(__file__).resolve().parent.parent
DEST=ROOT/'dist'
REF=ROOT/'personal'
ASSETS=json.loads((ROOT/'upstream/data/assets.json').read_text())
MAP=json.loads((REF/'visual-source-map.json').read_text())['files']
CAP=400*1024*1024
lock=threading.Lock(); total=0; done=0; failures=[]; skips=[]; downloaded=[]; started=time.time()
refs=set()
def walk(v):
 if isinstance(v,str) and v.startswith('/assets/') and not v.startswith('/assets/audio/'):refs.add(v)
 elif isinstance(v,dict):
  for c in v.values():walk(c)
 elif isinstance(v,list):
  for c in v:walk(c)
walk(ASSETS)
chars={v.get('charId') for v in json.loads((ROOT/'upstream/data/chess.json').read_text()).values() if isinstance(v,dict)}
def priority(p):
 if '/spine/' in p:return 0 if any('/'+c+'/' in p for c in chars if c) or '/enemy/' in p else 1
 if '/char/' in p:return 2 if any('/'+c+'.' in p or '/'+c+'_' in p for c in chars if c) else 3
 if '/ui/' in p:return 4
 return 5
paths=sorted(refs,key=lambda p:(priority(p),p))
for p in paths:
 f=DEST/p.lstrip('/')
 if f.exists():total+=f.stat().st_size

def validate(data,p):
 if len(data)==0:raise ValueError('empty')
 if p.endswith('.png') and not data.startswith(b'\x89PNG\r\n\x1a\n'):raise ValueError('not PNG')
 if p.endswith('.atlas') and b'<html' in data[:300].lower():raise ValueError('HTML instead of atlas')
 if p.endswith('.skel') and (data.startswith(b'<!') or data.startswith(b'<html')):raise ValueError('HTML instead of skel')

def get(p):
 global total,done
 f=DEST/p.lstrip('/')
 if f.exists():
  try:
   b=f.read_bytes();validate(b,p)
   with lock:done+=1
   return
  except Exception:pass
 with lock:
  if total>=CAP:skips.append(p);done+=1;return
 rec=MAP.get(p,{})
 urls=list(dict.fromkeys(rec.get('urls',[])+rec.get('mirrors',[])))
 err='no mapped source'
 for u in urls:
  for attempt in range(2):
   try:
    if u.startswith('data:'):
     meta,data=u.split(',',1);b=base64.b64decode(data) if ';base64' in meta else urllib.parse.unquote_to_bytes(data)
    else:
     h=urllib.parse.urlparse(u).hostname
     if h not in {'raw.githubusercontent.com','cdn.jsdelivr.net','web.hycdn.cn'}:raise ValueError('source host not allowed: '+str(h))
     req=urllib.request.Request(u,headers={'User-Agent':'Personal-Stronghold-Research/1.0','Accept-Encoding':'identity'})
     with urllib.request.urlopen(req,timeout=18) as r:
      b=r.read(32*1024*1024+1)
      if r.headers.get('Content-Encoding')=='gzip':
       import gzip;b=gzip.decompress(b)
     if len(b)>32*1024*1024:raise ValueError('asset over 32 MiB')
    validate(b,p)
    with lock:
     if total+len(b)>CAP:skips.append(p);done+=1;return
     total+=len(b)
    f.parent.mkdir(parents=True,exist_ok=True);tmp=f.with_name(f.name+'.part');tmp.write_bytes(b);tmp.replace(f)
    with lock:
     downloaded.append({'path':p,'bytes':len(b),'source':u if not u.startswith('data:') else 'embedded official statistics CSS'})
     done+=1
     if done%100==0:print(json.dumps({'done':done,'of':len(paths),'MiB':round(total/1048576,1),'failed':len(failures),'seconds':round(time.time()-started)}),flush=True)
    return
   except Exception as e:
    err=str(e)
    if '404' in err or '410' in err:break
    if attempt==0:time.sleep(.3)
 with lock:failures.append({'path':p,'error':err,'sources':len(urls)});done+=1

print(json.dumps({'starting':len(paths),'existingMiB':round(total/1048576,1),'threads':10,'capMiB':400,'dest':str(DEST/'assets')}),flush=True)
for tier in range(6):
 batch=[p for p in paths if priority(p)==tier]
 print('priority '+str(tier)+' files '+str(len(batch)),flush=True)
 with concurrent.futures.ThreadPoolExecutor(max_workers=10) as ex:list(ex.map(get,batch))
 result={'requested':len(paths),'done':done,'bytes':total,'downloaded':len(downloaded),'failures':failures,'skippedCap':skips,'elapsedSeconds':round(time.time()-started),'records':downloaded}
 (REF/'asset-cache-report.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
 print(json.dumps({**{k:v for k,v in result.items() if k not in {'records','failures','skippedCap'}},'failures':len(failures),'skippedCap':len(skips)}),flush=True)
print('ASSET_DOWNLOAD_COMPLETE',flush=True)
