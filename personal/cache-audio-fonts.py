import concurrent.futures,json,pathlib,threading,time,urllib.parse,urllib.request
ROOT=pathlib.Path(__file__).resolve().parent.parent
REF=ROOT/'personal';DEST=ROOT/'dist'
MAP=json.loads((REF/'audio-font-source-map.json').read_text())['files']
LIMIT=30_000_000
lock=threading.Lock();total=0;records=[];failures=[];started=time.time()
def get(p):
 global total
 rec=MAP[p];err='no source'
 for u in list(dict.fromkeys(rec['urls']+rec.get('mirrors',[]))):
  for attempt in range(2):
   try:
    if urllib.parse.urlparse(u).hostname not in {'raw.githubusercontent.com','cdn.jsdelivr.net'}:raise ValueError('unapproved source')
    with urllib.request.urlopen(urllib.request.Request(u,headers={'User-Agent':'Personal-Stronghold-Research/1.0','Accept-Encoding':'identity'}),timeout=20) as r:b=r.read(15_000_001)
    if not b or len(b)>15_000_000:raise ValueError('empty or oversized file')
    if p.endswith('.mp3') and not (b.startswith(b'ID3') or b[0]==255 and b[1]&224==224):raise ValueError('not MP3')
    if p.endswith(('.otf','.ttf')) and b[:4] not in {b'OTTO',b'\x00\x01\x00\x00',b'true'}:raise ValueError('not font')
    with lock:
     if total+len(b)>LIMIT:raise ValueError('30 MB supplemental cap')
     total+=len(b)
    f=DEST/p.lstrip('/');f.parent.mkdir(parents=True,exist_ok=True);f.write_bytes(b)
    with lock:records.append({'path':p,'bytes':len(b),'source':u})
    return
   except Exception as e:
    err=str(e)
    if '404' in err or '410' in err:break
    if attempt==0:time.sleep(.3)
 with lock:failures.append({'path':p,'error':err})
with concurrent.futures.ThreadPoolExecutor(max_workers=8) as ex:list(ex.map(get,sorted(MAP)))
result={'requested':len(MAP),'downloaded':len(records),'bytes':total,'elapsedSeconds':round(time.time()-started),'failures':failures,'records':records}
(REF/'audio-font-cache-report.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
print(json.dumps({k:v for k,v in result.items() if k!='records'},ensure_ascii=False))
