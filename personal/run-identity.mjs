import {sha256Hex} from '../upstream/shared/sha256.js';

// Metadata only: never consume the six seeded gameplay RNG streams.
export function newRunId() {
  return 'run_' + Array.from(crypto.getRandomValues(new Uint8Array(16)), b=>b.toString(16).padStart(2,'0')).join('');
}
export function validRunId(value) {return typeof value==='string' && /^(?:run_[a-f0-9]{32}|[a-f0-9]{20})$/.test(value);}
export function checkpointRunId(snapshot) {
  if (snapshot.runId !== undefined) {
    if (!validRunId(snapshot.runId)) throw new TypeError('存档对局身份无效');
    return snapshot.runId;
  }
  // Preserve the v2 vault's existing grouping on first legacy restore. Resolve
  // BEFORE replacing the room code, then carry this ID in every new checkpoint.
  // Do not guess that separate old room codes represent the same run.
  return sha256Hex(JSON.stringify([snapshot.options.seats[0].playerId,snapshot.options.roomCode,snapshot.options.seed])).slice(0,20);
}
