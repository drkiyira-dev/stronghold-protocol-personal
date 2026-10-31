import {cp,mkdir,readdir,writeFile} from 'node:fs/promises';
import path from 'node:path';

// The static artifact has no node_modules tree. Carry the unchanged notices and
// the supplemental licence files of packages bundled into the browser worker.
export async function publishLicenses(root,dist){
  async function copy(from,to=from){
    await mkdir(path.dirname(path.join(dist,to)),{recursive:true});
    await cp(path.join(root,from),path.join(dist,to));
  }
  for(const file of ['LICENSE','NOTICE.md','upstream/LICENSE','upstream/NOTICE.md','upstream/THIRD-PARTY-NOTICES.md'])await copy(file);
  await copy('upstream/THIRD-PARTY-NOTICES.md','THIRD-PARTY-NOTICES.md');
  const entries=[];
  for(const pkg of ['ses','acorn','@endo/cache-map','@endo/env-options','@endo/immutable-arraybuffer']){
    const dir='node_modules/'+pkg,files=(await readdir(path.join(root,dir))).filter(f=>/^(?:LICENSE|NOTICE|AUTHORS)(?:$|[-.])/i.test(f)).sort();
    if(!files.some(f=>/^LICENSE(?:$|[-.])/i.test(f)))throw Error('Missing bundled package licence: '+pkg);
    for(const file of files){await copy(dir+'/'+file,'licenses/'+pkg+'/'+file);entries.push(`- [${pkg}/${file}](${pkg}/${file})`);}
  }
  await writeFile(path.join(dist,'licenses/README.md'),
    '# Static bundle licence supplements\n\n'+
    'The original [third-party notices](../THIRD-PARTY-NOTICES.md) and [project notice](../NOTICE.md) remain unchanged. These additional package files accompany the static worker; they do not grant rights to game art.\n\n'+entries.join('\n')+'\n');
}
