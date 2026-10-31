import {replaceContract} from './build-identity.mjs';

export function adaptSceneImport(source){
  // The existing importer and prune operation must see the full validation list,
  // while the renderer sees only art actually available in this browser.
  for(const call of ['readServedManifest(doFetch, ','readManifest(']){
    const read=call+"'/data/local-assets.json', true)";
    source=replaceContract(source,'const local = await '+read+';',
      'const local = mergeLocalManifests(await '+read+", await "+call+"'/personal/scene-import.json', true));",'local scene import manifest');
  }
  // The original 3D loader encodeURI()s paths; Cache Storage distinguishes literal
  // brackets from %5B/%5D. Store both verified keys, including them in pruning.
  return replaceContract(source,"if (typeof url === 'string' && url) out.push(url);",
    "if (typeof url === 'string' && url) { out.push(url); if (/^\\/assets\\/~[a-f0-9]{16}\\/local\\//.test(url) && encodeURI(url) !== url) out.push(encodeURI(url)); }",'encoded scene import cache keys');
}
export function adaptSceneTiles(source){
  // File hashes differ: a sibling of the diffuse atlas has its own cache key.
  return replaceContract(source,'`${dir}/tiles.json`',
    "(assets.localUrl('map/autochess', 'tiles') || `${dir}/tiles.json`)",'hashed tile table');
}
