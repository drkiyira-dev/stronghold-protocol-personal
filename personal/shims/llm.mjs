// Optional external AI is a server development feature; this local edition uses
// the unchanged built-in strategy implementation without external IO.
export const llmIntegrationEnabledNow = false;
export const EXTERNAL_BOT = null;
export const LLM_IGNORED_LOG = 'External AI is unavailable in the local edition.';
export const createExternalAI = () => null;
export const llmIntegrationEnabled = () => false;
export const releaseIgnoresExternalAi = () => false;
export const noteLlmIgnored = () => {};
export function validateExternalConfig() { throw new Error(LLM_IGNORED_LOG); }
