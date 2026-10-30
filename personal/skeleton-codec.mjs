// Lossless transport compression only. Pixi receives the exact original skeleton.
export async function decodeSkeletonResponse(response) {
  if (!response.ok) return response;
  const bytes = new Uint8Array(await response.clone().arrayBuffer());
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) return response;
  const headers = new Headers(response.headers);
  headers.delete('content-encoding'); headers.delete('content-length');
  headers.set('content-type','application/octet-stream');
  if (response.body) await response.body.cancel();
  const body = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(body,{status:response.status,statusText:response.statusText,headers});
}
export function installSkeletonTransport() {
  const original = globalThis.fetch.bind(globalThis);
  globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? String(input) : input.url,location.href);
    const skeleton = url.origin === location.origin && url.pathname.startsWith('/assets/spine/') && url.pathname.endsWith('.skel');
    if (!skeleton) return original(input,init);
    // A separate cache key also prevents reuse of pre-compression deployment files.
    url.searchParams.set('personal-skeleton','gzip-v1');
    const request = input instanceof Request ? new Request(url,input) : url.href;
    return decodeSkeletonResponse(await original(request,init));
  };
}
