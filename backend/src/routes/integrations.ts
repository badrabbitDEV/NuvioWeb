import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { ApiError, asyncRoute } from '../errors.js';

const router = Router();
const DEVICE_TIMEOUT = 12_000;

async function providerJson(url: string, init: RequestInit, provider: string): Promise<any> {
  let response: Response;
  try {
    response = await fetch(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(DEVICE_TIMEOUT) });
  } catch {
    throw new ApiError(502, `Não foi possível conectar ao serviço ${provider}.`, 'PROVIDER_UNAVAILABLE');
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const remoteError = typeof payload?.error_description === 'string' ? payload.error_description
      : typeof payload?.error === 'string' ? payload.error
      : typeof payload?.message === 'string' ? payload.message : `HTTP ${response.status}`;
    throw new ApiError(response.status === 400 || response.status === 401 ? 400 : 502, `${provider}: ${remoteError}`.slice(0, 240), 'PROVIDER_REJECTED');
  }
  return payload;
}

function requireTrakt() {
  if (!config.traktClientId || !config.traktClientSecret) throw new ApiError(503, 'Configure TRAKT_CLIENT_ID e TRAKT_CLIENT_SECRET na Render.', 'TRAKT_NOT_CONFIGURED');
}
function requireSimkl() {
  if (!config.simklClientId || !config.simklClientSecret) throw new ApiError(503, 'Configure SIMKL_CLIENT_ID e SIMKL_CLIENT_SECRET na Render.', 'SIMKL_NOT_CONFIGURED');
}
function traktHeaders(token?: string): HeadersInit {
  return {
    'content-type': 'application/json',
    'trakt-api-version': '2',
    'trakt-api-key': config.traktClientId,
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  };
}


function requireMdbKey(req: import('express').Request): string {
  const key = String(req.header('x-mdblist-key') ?? '').trim();
  if (!key || key.length < 12 || key.length > 256 || /[\r\n]/.test(key)) {
    throw new ApiError(401, 'Informe uma API key válida do MDBList no cabeçalho da conexão.', 'MDBLIST_KEY_REQUIRED');
  }
  return key;
}

async function mdblistRequest(path: string, key: string, params: Record<string, string> = {}): Promise<unknown> {
  const url = new URL(path.replace(/^\//, ''), 'https://api.mdblist.com/');
  url.searchParams.set('apikey', key);
  for (const [name, value] of Object.entries(params)) if (value) url.searchParams.set(name, value);
  return providerJson(url.toString(), { headers: { accept: 'application/json' } }, 'MDBList');
}

router.get('/mdblist/user', asyncRoute(async (req, res) => {
  const key = requireMdbKey(req);
  const [user, lists] = await Promise.all([
    mdblistRequest('/user', key),
    mdblistRequest('/lists/user', key),
  ]);
  res.json({ user, lists });
}));

router.get('/mdblist/watchlist', asyncRoute(async (req, res) => {
  const key = requireMdbKey(req);
  const mediaType = z.enum(['movie', 'show']).optional().parse(req.query.type);
  const limit = z.coerce.number().int().min(1).max(100).default(50).parse(req.query.limit);
  const path = mediaType ? `/watchlist/items/${mediaType}` : '/watchlist/items';
  const data = await mdblistRequest(path, key, { limit: String(limit), append_to_response: 'genres,poster,description,ratings' });
  res.json({ data });
}));

router.get('/mdblist/list/:username/:listname/items', asyncRoute(async (req, res) => {
  const key = requireMdbKey(req);
  const username = z.string().min(1).max(80).regex(/^[A-Za-z0-9_.-]+$/).parse(req.params.username);
  const listname = z.string().min(1).max(120).regex(/^[A-Za-z0-9_.-]+$/).parse(req.params.listname);
  const mediaType = z.enum(['movie', 'show']).optional().parse(req.query.type);
  const limit = z.coerce.number().int().min(1).max(100).default(50).parse(req.query.limit);
  const suffix = mediaType ? `/items/${mediaType}` : '/items';
  const data = await mdblistRequest(`/lists/${encodeURIComponent(username)}/${encodeURIComponent(listname)}${suffix}`, key, { limit: String(limit), append_to_response: 'genres,poster,description,ratings' });
  res.json({ data });
}));

router.get('/mdblist/media/:provider/:type/:id', asyncRoute(async (req, res) => {
  const key = requireMdbKey(req);
  const provider = z.enum(['tmdb', 'imdb', 'trakt', 'tvdb', 'mal', 'mdblist']).parse(req.params.provider);
  const mediaType = z.enum(['movie', 'show']).parse(req.params.type);
  const mediaId = z.string().min(1).max(80).regex(/^[A-Za-z0-9._-]+$/).parse(req.params.id);
  const data = await mdblistRequest(`/${provider}/${mediaType}/${encodeURIComponent(mediaId)}`, key);
  res.json({ data });
}));


function requirePublicMetaDbKey(req: import('express').Request): string {
  const key = String(req.header('x-publicmetadb-key') ?? '').trim();
  if (!key || key.length < 12 || key.length > 512 || /[\r\n]/.test(key)) {
    throw new ApiError(401, 'Informe uma API key válida do PublicMetaDB.', 'PUBLICMETADB_KEY_REQUIRED');
  }
  return key;
}

async function publicMetaDbRequest(path: string, key: string, method: 'GET'|'POST'|'DELETE' = 'GET', body?: unknown): Promise<any> {
  const url = new URL(path.replace(/^\//, ''), 'https://publicmetadb.com/');
  let response: Response;
  try {
    response = await fetch(url, {
      method,
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
      headers: { accept: 'application/json', authorization: `Bearer ${key}`, 'user-agent': 'Nuvio-Web-Port/1.0.4', ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  } catch {
    throw new ApiError(502, 'Não foi possível conectar ao PublicMetaDB.', 'PUBLICMETADB_UNAVAILABLE');
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof payload?.message === 'string' ? payload.message : typeof payload?.error === 'string' ? payload.error : `HTTP ${response.status}`;
    throw new ApiError(response.status === 401 ? 401 : response.status === 429 ? 429 : 502, `PublicMetaDB: ${message}`.slice(0, 240), 'PUBLICMETADB_REJECTED');
  }
  return payload;
}

router.post('/publicmetadb/verify', asyncRoute(async (req, res) => {
  const key = requirePublicMetaDbKey(req);
  const data = await publicMetaDbRequest('/api/external/lists?page=1&perPage=1', key);
  res.json({ ok: true, data });
}));

router.get('/publicmetadb/sync', asyncRoute(async (req, res) => {
  const key = requirePublicMetaDbKey(req);
  const [lists, watched, resume] = await Promise.all([
    publicMetaDbRequest('/api/external/lists?page=1&perPage=100', key),
    publicMetaDbRequest('/api/external/watched?page=1&perPage=100', key),
    publicMetaDbRequest('/api/external/resume?page=1&perPage=100', key),
  ]);
  res.json({ lists, watched, resume });
}));

router.post('/publicmetadb/watched', asyncRoute(async (req, res) => {
  const key = requirePublicMetaDbKey(req);
  const input = z.object({ tmdb_id: z.number().int().positive(), media_type: z.enum(['movie','tv']), watched_at: z.string().max(64).optional(), season: z.number().int().min(0).max(100).optional(), episode: z.number().int().min(0).max(1000).optional() }).strict().parse(req.body);
  const data = await publicMetaDbRequest('/api/external/watched?dedupe=true', key, 'POST', input);
  res.json({ data });
}));

router.delete('/publicmetadb/watched', asyncRoute(async (req, res) => {
  const key = requirePublicMetaDbKey(req);
  const input = z.object({ tmdb_id: z.coerce.number().int().positive(), media_type: z.enum(['movie','tv']), season: z.coerce.number().int().min(0).max(100).optional(), episode: z.coerce.number().int().min(0).max(1000).optional() }).strict().parse(req.body);
  const url = new URL('/api/external/watched', 'https://publicmetadb.com');
  for (const [name,value] of Object.entries(input)) if (value !== undefined) url.searchParams.set(name, String(value));
  const response = await publicMetaDbRequest(url.pathname + url.search, key, 'DELETE');
  res.json({ data: response });
}));

router.post('/publicmetadb/resume', asyncRoute(async (req, res) => {
  const key = requirePublicMetaDbKey(req);
  const input = z.object({ tmdb_id: z.number().int().positive(), media_type: z.enum(['movie','tv']), position_ms: z.number().int().min(0).max(86_400_000), runtime_ms: z.number().int().positive().max(86_400_000), season: z.number().int().min(0).max(100).optional(), episode: z.number().int().min(0).max(1000).optional() }).strict().parse(req.body);
  const data = await publicMetaDbRequest('/api/external/resume', key, 'POST', input);
  res.json({ data });
}));


function requireWeTrakrClient() {
  if (!config.wetrakrClientId) throw new ApiError(503, 'Configure WETRAKR_CLIENT_ID na Render usando um aplicativo autorizado.', 'WETRAKR_NOT_CONFIGURED');
}
function weTrakrHeaders(token?: string): HeadersInit {
  return {
    accept: 'application/json',
    'content-type': 'application/json',
    'user-agent': 'Nuvio-Web-Port/1.0.4',
    'wetrakr-api-key': config.wetrakrClientId,
    'wetrakr-api-version': '1',
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  };
}
async function weTrakrRequest(path: string, method: 'GET'|'POST', token?: string, body?: unknown): Promise<{status:number;data:any}> {
  let response: Response;
  try {
    response = await fetch(new URL(path.replace(/^\//,''), 'https://api.wetrakr.com/'), {
      method, headers: weTrakrHeaders(token), redirect: 'error', signal: AbortSignal.timeout(15_000),
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  } catch {
    throw new ApiError(502, 'Não foi possível conectar à API WeTrakr.', 'WETRAKR_UNAVAILABLE');
  }
  const data = await response.json().catch(() => ({}));
  return { status: response.status, data };
}
function requireWeTrakrToken(req: import('express').Request): string {
  const token = String(req.header('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!token || token.length > 4096 || /[\r\n]/.test(token)) throw new ApiError(401, 'Token WeTrakr necessário.', 'WETRAKR_AUTH_REQUIRED');
  return token;
}
router.post('/wetrakr/device-code', asyncRoute(async (_req, res) => {
  requireWeTrakrClient();
  const result = await weTrakrRequest('/oauth/device/code', 'POST', undefined, { client_id: config.wetrakrClientId });
  if (result.status < 200 || result.status >= 300) throw new ApiError(result.status === 423 ? 503 : 502, String(result.data?.message ?? 'Não foi possível obter um código WeTrakr.'), 'WETRAKR_DEVICE_CODE_FAILED');
  res.json({ deviceCode: result.data.device_code, userCode: result.data.user_code, verificationUrl: result.data.verification_url ?? result.data.verification_uri ?? 'https://wetrakr.com/activate', expiresIn: Number(result.data.expires_in ?? 600), interval: Number(result.data.interval ?? 5) });
}));
router.post('/wetrakr/device-token', asyncRoute(async (req, res) => {
  requireWeTrakrClient();
  const code = z.string().min(6).max(512).parse((req.body as { code?: unknown })?.code);
  const result = await weTrakrRequest('/oauth/device/token', 'POST', undefined, { code, device_code: code, client_id: config.wetrakrClientId });
  if (result.status === 400 || result.status === 429 || result.status >= 500) { res.status(202).json({ pending: true, message: 'Autorização ainda pendente. Conclua no site e tente novamente.' }); return; }
  if (result.status < 200 || result.status >= 300) throw new ApiError(401, String(result.data?.message ?? result.data?.error_description ?? 'Autorização WeTrakr recusada.'), 'WETRAKR_AUTH_REJECTED');
  res.json({ pending: false, accessToken: result.data.access_token, refreshToken: result.data.refresh_token, expiresIn: Number(result.data.expires_in ?? 0) });
}));
router.post('/wetrakr/refresh', asyncRoute(async (req, res) => {
  requireWeTrakrClient();
  const refreshToken = z.string().min(8).max(4096).parse((req.body as { refreshToken?: unknown })?.refreshToken);
  const result = await weTrakrRequest('/oauth/token/refresh', 'POST', undefined, { refresh_token: refreshToken, client_id: config.wetrakrClientId });
  if (result.status < 200 || result.status >= 300 || typeof result.data?.access_token !== 'string') {
    throw new ApiError(result.status === 401 ? 401 : 502, String(result.data?.message ?? result.data?.error_description ?? 'Não foi possível renovar o token WeTrakr.'), 'WETRAKR_REFRESH_FAILED');
  }
  res.json({ accessToken: result.data.access_token, refreshToken: result.data.refresh_token ?? refreshToken, expiresIn: Number(result.data.expires_in ?? 0) });
}));

router.get('/wetrakr/account', asyncRoute(async (req, res) => {
  requireWeTrakrClient();
  const token = requireWeTrakrToken(req);
  const result = await weTrakrRequest('/account/settings', 'GET', token);
  if (result.status < 200 || result.status >= 300) throw new ApiError(result.status === 401 ? 401 : 502, String(result.data?.message ?? 'Não foi possível ler a conta WeTrakr.'), 'WETRAKR_ACCOUNT_FAILED');
  res.json(result.data);
}));
router.get('/wetrakr/watched', asyncRoute(async (req, res) => {
  requireWeTrakrClient();
  const token = requireWeTrakrToken(req);
  const [movies, shows, episodes] = await Promise.all([
    weTrakrRequest('/sync/tracking/watched/movies?extended=movie_level_1', 'GET', token),
    weTrakrRequest('/sync/tracking/watched/shows?extended=show_level_1', 'GET', token),
    weTrakrRequest('/sync/tracking/watched/episodes', 'GET', token),
  ]);
  const failures = [movies, shows, episodes].filter(item => item.status < 200 || item.status >= 300);
  if (failures.length) throw new ApiError(failures.some(item => item.status === 401) ? 401 : 502, 'Falha ao consultar o histórico WeTrakr.', 'WETRAKR_SYNC_FAILED');
  res.json({ movies: movies.data, shows: shows.data, episodes: episodes.data });
}));
const weTrakrScrobbleSchema = z.object({
  action: z.enum(['start','pause','stop']), type: z.enum(['movie','show']), title: z.string().min(1).max(240), year: z.number().int().min(1880).max(2200).optional(),
  ids: z.object({ imdb:z.string().max(32).optional(), tmdb:z.number().int().positive().optional(), tvdb:z.number().int().positive().optional() }).optional(),
  season:z.number().int().min(0).max(100).optional(), episode:z.number().int().min(0).max(1000).optional(), progress:z.number().min(0).max(100),
}).strict();
router.post('/wetrakr/scrobble', asyncRoute(async (req, res) => {
  requireWeTrakrClient();
  const token = requireWeTrakrToken(req);
  const input = weTrakrScrobbleSchema.parse(req.body);
  const body: Record<string, unknown> = { progress: input.progress };
  body[input.type] = { title: input.title, ...(input.year ? { year: input.year } : {}), ...(input.ids ? { ids: input.ids } : {}) };
  if (input.type === 'show') body.episode = { season: input.season ?? 1, number: input.episode ?? 1 };
  const result = await weTrakrRequest(`/scrobble/${input.action}`, 'POST', token, body);
  if (result.status < 200 || result.status >= 300) throw new ApiError(result.status === 401 ? 401 : 502, String(result.data?.message ?? 'Falha ao sincronizar reprodução WeTrakr.'), 'WETRAKR_SCROBBLE_FAILED');
  res.json(result.data);
}));

router.get('/config', (_req, res) => res.json({
  trakt: Boolean(config.traktClientId && config.traktClientSecret),
  simkl: Boolean(config.simklClientId && config.simklClientSecret),
  wetrakr: Boolean(config.wetrakrClientId),
  tmdb: Boolean(config.tmdbToken),
}));

const deviceCodeSchema = z.object({}).strict();
router.post('/trakt/device-code', asyncRoute(async (_req, res) => {
  deviceCodeSchema.parse(_req.body ?? {});
  requireTrakt();
  const payload = await providerJson('https://api.trakt.tv/oauth/device/code', {
    method: 'POST', headers: traktHeaders(), body: JSON.stringify({ client_id: config.traktClientId }),
  }, 'Trakt');
  res.json({ deviceCode: payload.device_code, userCode: payload.user_code, verificationUrl: payload.verification_url, expiresIn: payload.expires_in, interval: payload.interval ?? 5 });
}));

router.post('/trakt/device-token', asyncRoute(async (req, res) => {
  requireTrakt();
  const { code } = z.object({ code: z.string().min(8).max(256) }).parse(req.body);
  const payload = await providerJson('https://api.trakt.tv/oauth/device/token', {
    method: 'POST', headers: traktHeaders(), body: JSON.stringify({ code, client_id: config.traktClientId, client_secret: config.traktClientSecret }),
  }, 'Trakt');
  res.json({ accessToken: payload.access_token, refreshToken: payload.refresh_token, expiresIn: payload.expires_in, createdAt: payload.created_at, scope: payload.scope, tokenType: payload.token_type });
}));

router.post('/trakt/refresh', asyncRoute(async (req, res) => {
  requireTrakt();
  const { refreshToken } = z.object({ refreshToken: z.string().min(12).max(2048) }).parse(req.body);
  const payload = await providerJson('https://api.trakt.tv/oauth/token', {
    method: 'POST', headers: traktHeaders(), body: JSON.stringify({ refresh_token: refreshToken, client_id: config.traktClientId, client_secret: config.traktClientSecret, redirect_uri: 'urn:ietf:wg:oauth:2.0:oob', grant_type: 'refresh_token' }),
  }, 'Trakt');
  res.json({ accessToken: payload.access_token, refreshToken: payload.refresh_token, expiresIn: payload.expires_in, createdAt: payload.created_at, scope: payload.scope, tokenType: payload.token_type });
}));

router.get('/trakt/watched', asyncRoute(async (req, res) => {
  requireTrakt();
  const token = String(req.header('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token || token.length > 4096) throw new ApiError(401, 'Token Trakt necessário.', 'TRACKING_AUTH_REQUIRED');
  const [movies, shows] = await Promise.all([
    providerJson('https://api.trakt.tv/sync/watched/movies', { headers: traktHeaders(token) }, 'Trakt'),
    providerJson('https://api.trakt.tv/sync/watched/shows', { headers: traktHeaders(token) }, 'Trakt'),
  ]);
  res.json({ movies, shows });
}));

const scrobbleSchema = z.object({ action: z.enum(['start', 'pause', 'stop']), progress: z.number().min(0).max(100), movie: z.record(z.unknown()).optional(), episode: z.record(z.unknown()).optional(), show: z.record(z.unknown()).optional() });
router.post('/trakt/scrobble', asyncRoute(async (req, res) => {
  requireTrakt();
  const token = String(req.header('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token || token.length > 4096) throw new ApiError(401, 'Token Trakt necessário.', 'TRACKING_AUTH_REQUIRED');
  const input = scrobbleSchema.parse(req.body);
  const { action, ...body } = input;
  const payload = await providerJson(`https://api.trakt.tv/scrobble/${action}`, { method: 'POST', headers: traktHeaders(token), body: JSON.stringify(body) }, 'Trakt');
  res.json(payload);
}));

router.post('/simkl/device-code', asyncRoute(async (_req, res) => {
  requireSimkl();
  const payload = await providerJson(`https://api.simkl.com/oauth/pin?client_id=${encodeURIComponent(config.simklClientId)}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }, 'SIMKL');
  res.json({ deviceCode: payload.device_code, userCode: payload.user_code, verificationUrl: payload.verification_url, expiresIn: payload.expires_in, interval: payload.interval ?? 5 });
}));
router.post('/simkl/device-token', asyncRoute(async (req, res) => {
  requireSimkl();
  const { code } = z.object({ code: z.string().min(4).max(256) }).parse(req.body);
  const payload = await providerJson('https://api.simkl.com/oauth/token', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code, client_id: config.simklClientId, client_secret: config.simklClientSecret, redirect_uri: 'urn:ietf:wg:oauth:2.0:oob', grant_type: 'authorization_code' }),
  }, 'SIMKL');
  res.json({ accessToken: payload.access_token, tokenType: payload.token_type, expiresIn: payload.expires_in });
}));

router.get('/simkl/watched', asyncRoute(async (req, res) => {
  requireSimkl();
  const token = String(req.header('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token || token.length > 4096) throw new ApiError(401, 'Token 
