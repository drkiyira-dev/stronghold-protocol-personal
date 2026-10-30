// Keep protocol-relative and credential-bearing URLs out; accept the recorded external model hosts.
export function validPersonalSpine(sp){
  if(!sp||typeof sp.skel!=='string'||typeof sp.atlas!=='string'||!sp.anims||typeof sp.anims!=='object')return false;
  const valid=(value,extension)=>{
    if(typeof value!=='string'||/\s/.test(value))return false;
    if(value.startsWith('/')&&!value.startsWith('//'))return value.endsWith(extension);
    try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!u.search&&!u.hash&&['raw.githubusercontent.com','cdn.jsdelivr.net'].includes(u.hostname)&&u.pathname.endsWith(extension);}catch{return false;}
  };
  return valid(sp.skel,'.skel')&&valid(sp.atlas,'.atlas');
}
