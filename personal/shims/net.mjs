// There is no remote peer in the worker. The adapter supplies 127.0.0.1 only.
export const isIP = value => value === '127.0.0.1' ? 4 : value === '::1' ? 6 : 0;
