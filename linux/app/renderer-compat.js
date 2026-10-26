// The original desktop adapter gates getGameLogPath behind Android detection.
// Enable that one existing fallback so worker restarts retain the native path.
const pathGetterGate = /if\(!([\w$]+)\|\|(["'])function\2!=typeof ([\w$]+)\.getGameLogPath\)return(["'])\4/g;

function adaptRendererSource(source) {
  const matches = [...source.matchAll(pathGetterGate)];
  if (matches.length !== 1) return { source, patched: false };
  return {
    source: source.replace(pathGetterGate, 'if("function"!=typeof $3.getGameLogPath)return""'),
    patched: true,
  };
}

function installRendererCompatibility({ protocol, net, rendererURL }) {
  const renderer = new URL(rendererURL);
  if (!['http:', 'https:'].includes(renderer.protocol)) return;
  protocol.handle(renderer.protocol.slice(0, -1), async (request) => {
    const response = await net.fetch(request, { bypassCustomProtocolHandlers: true });
    const url = new URL(request.url);
    if (
      request.method !== 'GET' ||
      url.origin !== renderer.origin ||
      !url.pathname.startsWith('/assets/') ||
      !url.pathname.endsWith('.js') ||
      !response.ok
    ) return response;

    const source = await response.text();
    const result = adaptRendererSource(source);
    // net.fetch has decoded the body; do not forward compression/byte-length
    // headers for the reconstructed response, even when no change was needed.
    const headers = new Headers(response.headers);
    headers.delete('content-encoding');
    headers.delete('content-length');
    return new Response(result.source, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  });
}

module.exports = { adaptRendererSource, installRendererCompatibility };
