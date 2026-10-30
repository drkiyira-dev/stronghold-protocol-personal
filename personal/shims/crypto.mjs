// Only randomBytes(...).toString('hex') and randomInt(max) are used by the local
// room/session layer. Randomness in the original battle engine remains seeded.
export function randomBytes(size) {
  const bytes = crypto.getRandomValues(new Uint8Array(size));
  bytes.toString = (encoding) => {
    if (encoding !== 'hex') throw new Error('Only hexadecimal encoding is supported.');
    return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  };
  return bytes;
}
export function randomInt(max) {
  if (!Number.isSafeInteger(max) || max < 1 || max > 2 ** 32) throw new RangeError('Invalid random integer bound.');
  const limit = Math.floor(2 ** 32 / max) * max;
  const bytes = new Uint32Array(1);
  do { crypto.getRandomValues(bytes); } while (bytes[0] >= limit);
  return bytes[0] % max;
}
