// Browser data adapter for the upstream GPL-3.0 match engine.
// Original game records are supplied unchanged by the worker's fetch loader.
import { rememberOfficialBounds } from '../../upstream/shared/plugins/officialBounds.js';

let data = Object.freeze({});
export function deepFreeze(value) {
  const pending = [value];
  const seen = new Set();
  while (pending.length) {
    const item = pending.pop();
    if (!item || typeof item !== 'object' || seen.has(item)) continue;
    seen.add(item);
    pending.push(...Object.values(item));
    Object.freeze(item);
  }
  return value;
}
export function setData(value) { data = deepFreeze(value); rememberOfficialBounds(data); return data; }
export function getData() { return data; }
export function getConfig(value = data) { return value?.config || null; }
export function getMode(id, value = data) { return lookup('modes', id, getConfig(value)); }
export function lookup(file, id, value = data) {
  const map = value?.[file];
  return map && typeof id === 'string' && Object.hasOwn(map, id) ? map[id] : null;
}
export const getChess = (id, value) => lookup('chess', id, value);
export const getBond = (id, value) => lookup('bonds', id, value);
export const getGarrison = (id, value) => lookup('garrisons', id, value);
export const getItem = (id, value) => lookup('items', id, value);
export const getBand = (id, value) => lookup('bands', id, value);
export const getEffect = (id, value) => lookup('effects', id, value);
export const getEnemy = (id, value) => lookup('enemies', id, value);
export const getWave = (id, value) => lookup('waves', id, value);
export const getStage = (id, value) => lookup('stages', id, value);
export const getBoss = (id, value) => lookup('bosses', id, value);
export const getToken = (id, value) => lookup('tokens', id, value);
