export const CONNECTION_KEY='stronghold.personal.connection.v1';
export function validateServerAddress(value, pageProtocol='http:') {
  const url=new URL(value);
  if(!['ws:','wss:'].includes(url.protocol) || url.username || url.password || url.hash || url.search) throw new Error('请填写不含凭据和查询参数的 ws:// 或 wss:// 房间服务地址');
  if(pageProtocol==='https:' && url.protocol!=='wss:') throw new Error('HTTPS 站点需要 wss://；本机或局域网请从房间服务器提供的 HTTP 地址打开游戏');
  return url.href;
}
export function readConnection(storage, location) {
  if(new URL(location.href).searchParams.get('server')==='local') return {mode:'remote',url:`${location.protocol==='https:'?'wss':'ws'}://${location.host}/ws`};
  try {const c=JSON.parse(storage.getItem(CONNECTION_KEY));if(c?.mode==='remote')return {mode:'remote',url:validateServerAddress(c.url,location.protocol)};} catch {}
  return {mode:'local',url:null};
}
