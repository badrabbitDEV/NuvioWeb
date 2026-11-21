import type { AddonManifest, MediaItem, Stream } from '../types';

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000/api/v1').replace(/\/$/, '');
export class ApiClientError extends Error {
  constructor(message: string, public code = 'API_ERROR', public status = 0) { super(message); }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: { accept: 'application/json', ...(init.body ? { 'content-type': 'application/json' } : {}), ...init.headers },
      signal: init.signal ?? AbortSignal.timeout(25_000),
    });
  } catch {
    throw new ApiClientError('Não foi possível conectar à API. Confira a URL da Render e sua conexão.', 'NETWORK_ERROR');
  }
  const body = await response.json().catch(() => ({})) as { error?: { message?: string; code?: string } };
  if (!response.ok) throw new ApiClientError(body.error?.message ?? `Erro HTTP ${response.status}`, body.error?.code, response.status);
  return body as T;
}

export type TmdbListResponse = { page: number; results: MediaItem[]; total_pages: number; total_results: number };
export type TmdbDetails = MediaItem & {
  id: number;
  runtime?: number;
  number_of_seasons?: number;
  seasons?: Array<{ id: number; season_number: number; name: string; episode_count: number }>;
  external_ids?: { imdb_id?: string };
  genres?: Array<{ id: number; name: string }>;
  credits?: { cast?: Array<{ id: number; name: string; character: string; profile_path?: string | null }> };
  videos?: { results?: Array<{ key: string; site: string; type: string; name: string }> };
  recommendations?: { results?: MediaItem[] };
  similar?: { results?: MediaItem[] };
};

export type AddonResourceResponse = {
  addon: { id: string; name: string };
  data: { streams?: Stream[]; metas?: MediaItem[]; meta?: MediaItem; subtitles?: Array<{ id?: string; url?: string; lang?: string; label?: string }> };
};

export const api = {
  health: () => request<{ ok: boolean; features: Record<string, boolean> }>('/health'),
  trending: (language = 'pt-BR', type: 'all' | 'movie' | 'tv' = 'all', page = 1) => request<TmdbListResponse>(`/catalog/trending?type=${type}&page=${page}&language=${encodeURIComponent(language)}`),
  discover: (type: 'movie' | 'tv', sort = 'popularity.desc', language = 'pt-BR', page = 1, genre?: string) => request<TmdbListResponse>(`/catalog/discover?type=${type}&sort_by=${encodeURIComponent(sort)}&page=${page}&language=${encodeURIComponent(language)}${genre ? `&with_genres=${encodeURIComponent(genre)}` : ''}`),
  search: (query: string, language = 'pt-BR', page = 1) => request<TmdbListResponse>(`/catalog/search?q=${encodeURIComponent(query)}&page=${page}&language=${encodeURIComponent(language)}`),
  details: (type: 'movie' | 'tv', id: number, language = 'pt-BR') => request<TmdbDetails>(`/catalog/details/${type}/${id}?language=${encodeURIComponent(language)}`),
  season: (id: number, season: number, language = 'pt-BR') => request<{ episodes: Array<{ id: number; episode_number: number; name: string; overview?: string; still_path?: string | null; air_date?: string; vote_average?: number }> }>(`/catalog/season/${id}/${season}?language=${encodeURIComponent(language)}`),
  genres: (type: 'movie' | 'tv', language = 'pt-BR') => request<{ genres: Array<{ id: number; name: string }> }>(`/catalog/genres/${type}?language=${encodeURIComponent(language)}`),
  inspectAddon: (manifestUrl: string) => request<{ manifest: AddonManifest; manifestUrl: string }>('/addons/inspect', { method: 'POST', body: JSON.stringify({ manifestUrl }) }),
  addonDirectory: (url: string) => request<{ addons: Array<{name:string;description?:string;manifestUrl:string;adult?:boolean;configurable?:boolean;category?:string}>;filteredCount:number;source:string }>('/addons/directory', { method: 'POST', body: JSON.stringify({url}) }),
  addonResource: (input: { manifestUrl: string; resource: 'catalog' | 'meta' | 'stream' | 'subtitles'; type: string; id: string; extra?: Record<string, string> }) =>
    request<AddonResourceResponse>('/addons/resource', { method: 'POST', body: JSON.stringify(input) }),
  fetchLiveText: (url: string, kind: 'm3u' | 'xmltv') => request<{ content: string; bytes: number; kind: string }>('/live/fetch', { method: 'POST', body: JSON.stringify({ url, kind }) }),
  startTranscode: (url: string) => request<{ sessionId: string; playlistUrl: string; expiresAt: string; engine: 'ffmpeg-server' }>('/media/transcode', { method: 'POST', body: JSON.stringify({ url }), signal: AbortSignal.timeout(45_000) }),
  stopTranscode: (sessionId: string) => request<{ ok?: boolean }>(`/media/sessions/${encodeURIComponent(sessionId)}`, { method: 'DELETE' }),
  stalker: (input: { portalUrl:string; mac:string; action:'handshake'|'profile'|'genres'|'channels'|'create_link'|'epg'; token?:string; cmd?:string; channelId?:string }) => request<{ action:string; payload:unknown; data:unknown; streamUrl?:string; portalHost:string }>('/live/stalker', { method:'POST', body:JSON.stringify(input) }),
  createParty: (displayName: string) => request<{ code: string; websocketPath: string }>('/party/rooms', { method: 'POST', body: JSON.stringify({ displayName }) }),
  register: (email: string, password: string) => request<{ token: string; user: { id: string; email: string } }>('/account/register', { method: 'POST', body: JSON.stringify({ email, password }) }),
  login: (email: string, password: string) => request<{ token: string; user: { id: string; email: string } }>('/account/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  syncGet: (token: string) => request<{ state: Record<string, unknown>; revision: number; updatedAt: string | null }>('/account/sync', { headers: { authorization: `Bearer ${token}` } }),
  syncPut: (token: string, state: Record<string, unknown>) => request<{ ok: boolean; revision: number; updatedAt: string }>('/account/sync', { method: 'PUT', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify(state) }),
  checkParty: (code: string) => request<{ code: string; exists: boolean }>(`/party/rooms/${encodeURIComponent(code)}`),

  adminVerify: (key:string) => request<{ok:boolean;role:string}>('/admin/verify', { headers: { 'x-admin-api-key': key } }),
  adminOverview: (key:string, range:'24h'|'7d'|'30d'='7d') => request<{
    range:string; database:string; users:{total:number;new_24h:number;new_7d:number};
    analytics:{total:number;page_views:number;player_starts:number;p2p_starts:number;sessions:number;active_sessions:number};
    timeline:Array<{bucket:string;events:number}>; topRoutes:Array<{route:string;views:number}>;
    editions:Array<{edition:'normal'|'enhanced';events:number;page_views:number;player_starts:number;p2p_starts:number}>;
    recentEvents:Array<{event_name:string;edition:string;route?:string;media_type?:string;provider?:string;created_at:string}>;generatedAt:string;
  }>(`/admin/overview?range=${range}`, {headers:{'x-admin-api-key':key}}),
  adminUsers: (key:string) => request<{users:Array<{user_ref:string;created_at:string;updated_at:string}>}>('/admin/users',{headers:{'x-admin-api-key':key}}),
  adminEvents: (key:string) => request<{events:Array<{event_name:string;edition:string;route?:string;media_type?:string;provider?:string;created_at:string}>}>('/admin/events',{headers:{'x-admin-api-key':key}}),
  integrationConfig: () => request<{ trakt: boolean; simkl: boolean; wetrakr:boolean; tmdb: boolean }>('/integrations/config'),
  mdblistUser: (key:string) => request<{user:unknown;lists:unknown}>('/integrations/mdblist/user',{headers:{'x-mdblist-key':key}}),
  publicMetaDbVerify: (key:string) => request<{ok:boolean}>('/integrations/publicmetadb/verify',{method:'POST',headers:{'x-publicmetadb-key':key},body:'{}'}),
  publicMetaDbSync: (key:string) => request<{lists:unknown;watched:unknown;resume:unknown}>('/integrations/publicmetadb/sync',{headers:{'x-publicmetadb-key':key}}),
  publicMetaDbMarkWatched: (key:string,input:{tmdb_id:number;media_type:'movie'|'tv';watched_at?:string;season?:number;episode?:number}) => request<{data:unknown}>('/integrations/publicmetadb/watched',{method:'POST',headers:{'x-publicmetadb-key':key},body:JSON.stringify(input)}),
  publicMetaDbSaveResume: (key:string,input:{tmdb_id:number;media_type:'movie'|'tv';position_ms:number;runtime_ms:number;season?:number;episode?:number}) => request<{data:unknown}>('/integrations/publicmetadb/resume',{method:'POST',headers:{'x-publicmetadb-key':key},body:JSON.stringify(input)}),
  mdblistWatchlist: (key:string,type?:'movie'|'show') => request<{data:unknown}>(`/integrations/mdblist/watchlist?limit=100${type?`&type=${type}`:''}`,{headers:{'x-mdblist-key':key}}),
  mdblistListItems: (key:string,username:string,listname:string,type?:'movie'|'show') => request<{data:unknown}>(`/integrations/mdblist/list/${encodeURIComponent(username)}/${encodeURIComponent(listname)}/items?limit=100${type?`&type=${type}`:''}`,{headers:{'x-mdblist-key':key}}),
  mdblistMedia: (key:string,provider:'tmdb'|'imdb'|'trakt'|'tvdb'|'mal'|'mdblist',type:'movie'|'show',id:string) => request<{data:unknown}>(`/integrations/mdblist/media/${provider}/${type}/${encodeURIComponent(id)}`,{headers:{'x-mdblist-key':key}}),
  traktDeviceCode: () => request<{ deviceCode: string; userCode: string; verificationUrl: string; expiresIn: number; interval: number }>('/integrations/trakt/device-code', { method: 'POST', body: '{}' }),
  traktDeviceToken: (code: string) => request<{ accessToken: string; refreshToken: string; expiresIn: number; createdAt: number; scope?: string; tokenType?: string }>('/integrations/trakt/device-token', { method: 'POST', body: JSON.stringify({ code }) }),
  traktRefresh: (refreshToken: string) => request<{ accessToken: string; refreshToken: string; expiresIn: number; createdAt: number }>('/integrations/trakt/refresh', { method: 'POST', body: JSON.stringify({ refreshToken }) }),
  traktWatched: (token: string) => request<{ movies: unknown[]; shows: unknown[] }>('/integrations/trakt/watched', { headers: { authorization: `Bearer ${token}` } }),
  traktScrobble: (token: string, payload: { action: 'start' | 'pause' | 'stop'; progress: number; movie?: Record<string, unknown>; episode?: Record<string, unknown>; show?: Record<string, unknown> }) => request<Record<string, unknown>>('/integrations/trakt/scrobble', { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify(payload) }),
  simklDeviceCode: () => request<{ deviceCode: string; userCode: string; verificationUrl: string; expiresIn: number; interval: number }>('/integrations/simkl/device-code', { method: 'POST', body: '{}' }),
  simklDeviceToken: (code: string) => request<{ accessToken: string; tokenType?: string; expiresIn?: number }>('/integrations/simkl/device-token', { method: 'POST', body: JSON.stringify({ code }) }),
  simklWatched: (token: string) => request<Record<string, unknown>>('/integrations/simkl/watched', { headers: { authorization: `Bearer ${token}` } }),
  wetrakrDeviceCode: () => request<{deviceCode:string;userCode:string;verificationUrl:string;expiresIn:number;interval:number}>('/integrations/wetrakr/device-code',{method:'POST',body:'{}'}),
  wetrakrDeviceToken: (code:string) => request<{pending:boolean;accessToken?:string;refreshToken?:string;expiresIn?:number}>('/integrations/wetrakr/device-token',{method:'POST',body:JSON.stringify({code})}),
  wetrakrRefresh: (refreshToken:string) => request<{accessToken:string;refreshToken:string;expiresIn:number}>('/integrations/wetrakr/refresh',{method:'POST',body:JSON.stringify({refreshToken})}),
  wetrakrAccount: (token:string) => request<Record<string,unknown>>('/integrations/wetrakr/account',{headers:{authorization:`Bearer ${token}`}}),
  wetrakrWatched: (token:string) => request<{movies:unknown;shows:unknown;episodes:unknown}>('/integrations/wetrakr/watched',{headers:{authorization:`Bearer ${token}`}}),
  wetrakrScrobble: (token:string,payload:Record<string,unknown>) => request<Record<string,unknown>>('/integrations/wetrakr/scrobble',{method:'POST',headers:{authorization:`Bearer ${token}`},body:JSON.stringify(payload)}),
};

export function partyWebSocketUrl(path: string): string {
  const base = new URL(API_BASE);
  base.protocol = base.protocol === 'https:' ? 'wss:' : 'ws:';
  base.pathname = path;
  base.search = '';
  return base.toString();
}

export const tmdbImage = (path?: string | null, size = 'w500') => path ? `https://image.tmdb.org/t/p/${size}${path}` : undefined;
