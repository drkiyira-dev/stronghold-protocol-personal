// Server-only administrative test rooms are unavailable in the personal client.
export const parseTestModeEnv = () => 'off';
export const unrecognizedTestMode = () => null;
export const testModeGate = () => ({ enabled: false, warn: null });
