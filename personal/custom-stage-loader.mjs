import {contentHashOf, canonicalJson} from '../upstream/shared/plugins/identity.js';
import {fetchChecked, CONTENT_TIMEOUT_MS} from '../upstream/public/js/content.js';
import {ORIGINAL_STAGE_ID, validateStageDescriptor} from './custom-stage.mjs';

// The build extracts the upstream byte-checking/retry helper unchanged. This
// adapter only bounds the entire serial load and connects host cancellation.
export async function loadOriginalStage(fetcher = fetch, {signal, budgetMs = 60000, timeoutMs = CONTENT_TIMEOUT_MS, retryDelays} = {}) {
  const abort = new AbortController();
  const cancel = () => abort.abort(signal.reason);
  signal?.addEventListener('abort', cancel, {once:true});
  if (signal?.aborted) cancel();
  const timer = setTimeout(() => abort.abort(new DOMException('Original-stage load budget exceeded', 'TimeoutError')), budgetMs);
  function abortable(promise, scope = abort.signal) {
    return new Promise((resolve, reject) => {
      const cancelled = () => {scope.removeEventListener('abort',cancelled);reject(scope.reason);};
      scope.addEventListener('abort', cancelled, {once:true});
      if (scope.aborted) cancelled();
      Promise.resolve(promise).then(value => {scope.removeEventListener('abort',cancelled);resolve(value);},
        error => {scope.removeEventListener('abort',cancelled);reject(error);});
    });
  }
  const wait = ms => new Promise((resolve, reject) => {
    if (abort.signal.aborted) {reject(abort.signal.reason);return;}
    const cancelled = () => {clearTimeout(delay);reject(abort.signal.reason);};
    const delay = setTimeout(() => {abort.signal.removeEventListener('abort',cancelled);resolve();}, ms);
    abort.signal.addEventListener('abort',cancelled,{once:true});
  });
  const scopedFetch = async (url, init) => {
    if (abort.signal.aborted) throw abort.signal.reason;
    const request = new AbortController();
    const cancelLoad = () => request.abort(abort.signal.reason);
    const cancelAttempt = () => request.abort(init.signal.reason);
    abort.signal.addEventListener('abort',cancelLoad,{once:true});
    init.signal?.addEventListener('abort',cancelAttempt,{once:true});
    if (abort.signal.aborted) cancelLoad();
    if (init.signal?.aborted) cancelAttempt();
    const cleanup = () => {
      abort.signal.removeEventListener('abort',cancelLoad);
      init.signal?.removeEventListener('abort',cancelAttempt);
    };
    let bodyPending = false;
    try {
      const response = await abortable(fetcher(url,{...init,signal:request.signal}),request.signal);
      // HTTP errors can still have a streaming body. Stop it before removing
      // the cancellation links or beginning the upstream helper's next retry.
      if (!response.ok) {request.abort();return response;}
      bodyPending = true;
      return {ok:response.ok, status:response.status, arrayBuffer:async () => {
        try {return await abortable(response.arrayBuffer(),request.signal);} finally {cleanup();}
      }};
    } finally {if (!bodyPending) cleanup();}
  };
  const read = async (url, pin) => {
    try {return await fetchChecked(url,pin,{fetch:scopedFetch,wait,timeoutMs:Math.min(timeoutMs,budgetMs),retryDelays});}
    catch (error) {if (abort.signal.aborted) throw abort.signal.reason;throw error;}
  };
  try {
    const descriptor = validateStageDescriptor(await read('/personal/stages/rainfall-defense.json'));
    if (descriptor.id !== ORIGINAL_STAGE_ID) throw new Error('Unknown bundled original stage');
    if (!/^[a-f0-9]{64}$/.test(descriptor.cs)) throw new Error('Original-stage content identity missing');
    const prefix = `/cs/${descriptor.cs.slice(0, 16)}/`;
    const index = await read(prefix + 'index.json');
    if (index.cs !== descriptor.cs || index.vanilla !== false || index.scripts || index.execution) throw new Error('Only the bundled data-only stage is supported');
    const hashes = section => Object.fromEntries(Object.entries(section || {}).map(([name, f]) => [name, f.sha256]));
    const i18n = hashes(index.i18n);
    if (contentHashOf({app:index.app, sim:index.sim, data:hashes(index.data), plugins:index.plugins, settings:index.settings,
      ...(Object.keys(i18n).length ? {i18n} : {}), ...(index.rules ? {rules:index.rules} : {})}) !== descriptor.cs) throw new Error('Original-stage manifest checksum mismatch');
    const data = {};
    // Intentionally serial; keep download/parse pressure low on this local worker.
    for (const [name, pin] of Object.entries(index.data)) {
      if (!(pin.url.startsWith('/data/') || pin.url.startsWith(prefix)) || pin.url.includes('..')) throw new Error('Original-stage resource outside its content set');
      data[name] = await read(pin.url, pin);
    }
    // Goals and seed remain pinned to the upstream content hash/replay identity.
    const pinned = validateStageDescriptor(data.stages?.[descriptor.stageId]?.options?.originalStage);
    const {cs, plugin, ...advertised} = descriptor;
    if (canonicalJson(pinned) !== canonicalJson(advertised)) throw new Error('Original-stage metadata checksum mismatch');
    return {descriptor, data};
  } finally {clearTimeout(timer);signal?.removeEventListener('abort',cancel);}
}
