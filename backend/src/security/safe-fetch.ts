import { lookup } from 'node:dns/promises';
import { Agent, fetch as undiciFetch } from 'undici';
import ipaddr from 'ipaddr.js';
import { ApiError } from '../errors.js';

const REQUEST_TIMEOUT_MS = 12_000;
const DEFAULT_MAX_BYTES = 8 * 1024 * 1024;
type ResolvedAddress = { address: string; family: number };
type LookupCallback = (error: NodeJS.ErrnoException | null, address: string | ResolvedAddress[], family?: number) => void;

function isPublicAddress(value: string): boolean {
  try {
    let parsed = ipaddr.parse(value);
    if (parsed.kind() === 'ipv6' && (parsed as ipaddr.IPv6).isIPv4MappedAddress()) parsed = (parsed as ipaddr.IPv6).toIPv4Address();
    return parsed.range() === 'unicast';
  } catch { return false; }
}

function validateTarget(rawUrl: string, allowHttp: boolean): URL {
  let url: URL;
  try { url = new URL(rawUrl); } catch { throw new ApiError(400, 'URL inválida.', 'INVALID_URL'); }
  if (url.protocol !== 'https:' && !(allowHttp && url.protocol === 'http:')) throw new ApiError(400, 'A URL precisa usar HTTPS.', 'HTTPS_REQUIRED');
  if (url.username || url.password || url.hash) throw new ApiError(400, 'Credenciais e fragmentos não são permitidos na URL.', 'INVALID_URL');
  if (url.port && !['80', '443', '8080', '8443'].includes(url.port)) throw new ApiError(400, 'Porta não permitida.', 'PORT_BLOCKED');
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local') || hostname.endsWith('.internal') || hostname.endsWith('.test')) throw new ApiError(400, 'Host local ou reservado não é permitido.', 'HOST_BLOCKED');
  return url;
}

async function readPublicText(rawUrl: string, allowHttp: boolean, maxBytes: number, accept: string, extraHeaders: Record<string, string> = {}): Promise<string> {
  const url = validateTarget(rawUrl, allowHttp);
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  let addresses: ResolvedAddress[];
  try {
    const parsed = ipaddr.parse(hostname);
    addresses = [{ address: parsed.toString(), family: parsed.kind() === 'ipv4' ? 4 : 6 }];
  } catch {
    try { addresses = await lookup(hostname, { all: true, verbatim: true }); }
    catch { throw new ApiError(400, 'Não foi possível resolver o host.', 'DNS_FAILED'); }
  }
  if (!addresses.length || addresses.some((entry) => !isPublicAddress(entry.address))) throw new ApiError(400, 'O host aponta para uma rede privada ou reservada.', 'HOST_BLOCKED');

  const pinnedLookup = ((requestedHost: string, options: { all?: boolean }, callback: LookupCallback) => {
    if (requestedHost.toLowerCase() !== hostname.toLowerCase()) {
      const error = Object.assign(new Error('Unexpected DNS lookup'), { code: 'ENOTFOUND' }) as NodeJS.ErrnoException;
      callback(error, ''); return;
    }
    if (options?.all) callback(null, addresses);
    else callback(null, addresses[0].address, addresses[0].family);
  }) as never;
  const agent = new Agent({ connect: { lookup: pinnedLookup }, headersTimeout: REQUEST_TIMEOUT_MS, bodyTimeout: REQUEST_TIMEOUT_MS });
  try {
    const response = await undiciFetch(url, {
      dispatcher: agent, redirect: 'manual', signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: { accept, 'user-agent': 'Nuvio-Web-Port/1.0.4', ...extraHeaders },
    });
    if (response.status >= 300 && response.status < 400) throw new ApiError(502, 'Redirecionamentos de fontes externas são bloqueados por segurança.', 'REDIRECT_BLOCKED');
    if (!response.ok) throw new ApiError(502, `A fonte respondeu com HTTP ${response.status}.`, 'UPSTREAM_ERROR');
    const length = Number(response.headers.get('content-length') ?? 0);
    if (length > maxBytes) throw new ApiError(413, 'A resposta excede o limite permitido.', 'RESPONSE_TOO_LARGE');
    const reader = response.body?.getReader();
    if (!reader) throw new ApiError(502, 'A fonte retornou resposta vazia.', 'EMPTY_RESPONSE');
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      total += part.value.byteLength;
      if (total > maxBytes) { await reader.cancel().catch(() => undefined); throw new ApiError(413, 'A resposta excede o limite permitido.', 'RESPONSE_TOO_LARGE'); }
      chunks.push(part.value);
    }
    return new TextDecoder('utf-8', { fatal: false }).decode(Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))));
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) throw new ApiError(504, 'A fonte demorou demais para responder.', 'UPSTREAM_TIMEOUT');
    throw new ApiError(502, 'Não foi possível consultar a fonte externa.', 'UPSTREAM_FETCH_FAILED');
  } finally { await agent.close().catch(() => undefined); }
}


/**
 * Opens a public HTTPS response with DNS pinning and redirects disabled. The caller owns
 * the returned Agent and must call close() after consuming or aborting the response body.
 * Intended for streaming untrusted, user-selected media into a local decoder without
 * allowing FFmpeg (or another process) to resolve an arbitrary hostname itself.
 */
export async function openSafeResponse(
  rawUrl: string,
  allowHttp = false,
  extraHeaders: Record<string, string> = {},
): Promise<{ response: Awaited<ReturnType<typeof undiciFetch>>; close: () => Promise<void> }> {
  const allowed = new Set(['range', 'if-range', 'accept', 'user-agent']);
  for (const [key, value] of Object.entries(extraHeaders)) {
    if (!allowed.has(key.toLowerCase()) || value.length > 2048 || /[\r\n]/.test(value)) {
      throw new ApiError(400, 'Cabeçalho de mídia não permitido.', 'HEADER_BLOCKED');
    }
  }
  const url = validateTarget(rawUrl, allowHttp);
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  let addresses: ResolvedAddress[];
  try {
    const parsed = ipaddr.parse(hostname);
    addresses = [{ address: parsed.toString(), family: parsed.kind() === 'ipv4' ? 4 : 6 }];
  } catch {
    try { addresses = await lookup(hostname, { all: true, verbatim: true }); }
    catch { throw new ApiError(400, 'Não foi possível resolver o host da mídia.', 'DNS_FAILED'); }
  }
  if (!addresses.length || addresses.some((entry) => !isPublicAddress(entry.address))) {
    throw new ApiError(400, 'A mídia aponta para uma rede privada ou reservada.', 'HOST_BLOCKED');
  }
  const pinnedLookup = ((requestedHost: string, options: { all?: boolean }, callback: LookupCallback) => {
    if (requestedHost.toLowerCase() !== hostname.toLowerCase()) {
      const error = Object.assign(new Error('Unexpected DNS lookup'), { code: 'ENOTFOUND' }) as NodeJS.ErrnoException;
      callback(error, '');
      return;
    }
    if (options?.all) callback(null, addresses);
    else callback(null, addresses[0].address, addresses[0].family);
  }) as never;
  const agent = new Agent({ connect: { lookup: pinnedLookup }, headersTimeout: REQUEST_TIMEOUT_MS, bodyTimeout: 30_000 });
  try {
    const response = await undiciFetch(url, {
      dispatcher: agent, redirect: 'manual',
      headers: { accept: 'video/*, application/octet-stream, application/mp4, application/vnd.apple.mpegurl;q=0.8, */*;q=0.1', 'user-agent': 'Nuvio-Web-Port/1.0.4', ...extraHeaders },
    });
    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel().catch(() => undefined);
      await agent.close().catch(() => undefined);
      throw new ApiError(502, 'Redirecionamentos de mídia são bloqueados por segurança.', 'REDIRECT_BLOCKED');
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      await agent.close().catch(() => undefined);
      throw new ApiError(502, `A fonte de mídia respondeu com HTTP ${response.status}.`, 'UPSTREAM_ERROR');
    }
    return { response, close: async () => { await agent.close().catch(() => undefined); } };
  } catch (error) {
    await agent.close().catch(() => undefined);
    if (error instanceof ApiError) throw error;
    if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
      throw new ApiError(504, 'A fonte de mídia demorou demais para responder.', 'UPSTREAM_TIMEOUT');
    }
    throw new ApiError(502, 'Não foi possível abrir a fonte de mídia.', 'UPSTREAM_FETCH_FAILED');
  }
}

export async function safeFetchText(rawUrl: string, allowHttp = false, maxBytes = DEFAULT_MAX_BYTES): Promise<string> {
  return readPublicText(rawUrl, allowHttp, maxBytes, 'text/plain, application/xml, application/json, application/x-mpegURL, */*;q=0.5');
}

export async function safeFetchJson(rawUrl: string, allowHttp = false, headers: Record<string, string> = {}): Promise<unknown> {
  const allowed = new Set(['authorization', 'cookie', 'x-user-agent']);
  for (const [key,value] of Object.entries(headers)) {
    if (!allowed.has(key.toLowerCase())) throw new ApiError(400, 'Cabeçalho não permitido para o portal de mídia.', 'HEADER_BLOCKED');
    if (value.length > 8192 || /[\r\n]/.test(value)) throw new ApiError(400, 'Valor de cabeçalho inválido.', 'HEADER_INVALID');
  }
  const text = await readPublicText(rawUrl, allowHttp, 2 * 1024 * 1024, 'application/json, application/*+json;q=0.9, text/plain;q=0.5', headers);
  try { return JSON.parse(text) as unknown; }
  catch { throw new ApiError(502, 'A fonte não retornou JSON válido.', 'INVALID_JSON'); }
}
