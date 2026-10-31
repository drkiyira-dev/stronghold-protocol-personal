import {replaceContract} from './build-identity.mjs';

// Pixi's implicit ImageResource autoload can reject without an owner even when
// its error event is handled. Own this optional shadow load explicitly; preserve
// the upstream procedural shadow, cleanup and cosmetic-plugin fallback.
export function adaptMapShadow(source){
  source=replaceContract(source,'const t = P.Texture.from(url);',
    'const t = P.Texture.from(url, { resourceOptions: { autoLoad: false } });','optional map shadow ownership');
  return replaceContract(source,
    "offShadow = () => { t.baseTexture.off('loaded', use); t.baseTexture.off('error', failed); };",
    "offShadow = () => { t.baseTexture.off('loaded', use); t.baseTexture.off('error', failed); };\n        Promise.resolve(t.baseTexture.resource?.load?.()).catch(failed);",
    'optional map shadow rejection');
}
