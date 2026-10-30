// Browser stand-in from upstream server/http/static.js (GPL-3.0-or-later).
// The static host exposes the same data injection contract as the Node host.
import { getSimData } from './sim/simdata.js';
export function getData() { return getSimData() || {}; }
export function resetData() {}
