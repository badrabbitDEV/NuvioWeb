import type { MediaItem } from '../../types';

export type MediaServerProvider = 'jellyfin' | 'emby';
export type MediaServerSession = { provider: MediaServerProvider; baseUrl: string; userId: string; accessToken: string; serverId?: string; username: string };
export type MediaServerLibrary = { Name: string; Id: string };
export type PlexSection = { key: string; title: string; type: string };

async function serverRequest<T>(baseUrl: string, path: string, token?: string, init: RequestInit = {}): Promise<T> {
  const base = new URL(baseUrl);
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password) throw new Error('URL do servidor inválida.');
  const response = await fetch(new URL(path.replace(/^\//, ''), `${base.toString().replace(/\/$/, '')}/`), {
    ...init,
    headers: { accept: 'application/json', ...(init.body ? { 'content-type': 'application/json' } : {}), ...(token ? { 'X-Emby-Token': token, 'X-MediaBrowser-Token': token } : {}), ...init.headers },
    signal: init.signal ?? AbortSignal.timeout(20_000),
  });
  const payload = await response.json().catch(() => ({})) as { Message?: string; message?: string };
  if (!response.ok) throw new Error(payload.Message ?? payload.message ?? `Servidor respondeu HTTP ${response.status}.`);
  return payload as T;
}
function stableId(value: string): number { let hash = 0; for (let index = 0; index < value.length; index++) hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0; return Math.abs(hash) || 1; }
function mapMediaServerItems(items: Array<Record<string, unknown>>): MediaItem[] {
  return items.flatMap(item => {
    const sourceId = String(item.Id ?? '');
    if (!sourceId) return [];
    const title = String(item.Name ?? 'Sem título');
    const year = Number(item.ProductionYear);
    const mapped: MediaItem = { id: stableId(sourceId), media_type: item.Type === 'Series' ? 'tv' : 'movie', title, name: title, overview: String(item.Overview ?? ''), release_date: Number.isFinite(year) && year > 1800 ? `${year}-01-01` : undefined, sourceProvider: 'jellyfin', sourceId, sourceServerId: sourceId };
    return [mapped];
  });
}
export async function authenticateMediaServer(provider: MediaServerProvider, baseUrl: string, username: string, password: string): Promise<MediaServerSession> {
  const base = new URL(baseUrl.trim());
  if (base.protocol !== 'https:' && base.hostname !== 'localhost' && base.hostname !== '127.0.0.1') throw new Error('Use HTTPS para servidores remotos. HTTP só é permitido em localhost.');
  if (!username.trim() || !password) throw new Error('Informe usuário e senha.');
  const deviceId = crypto.randomUUID();
  const authHeader = `MediaBrowser Client="Nuvio Web", Device="Browser", DeviceId="${deviceId}", Version="1.0.0"`;
  const result = await serverRequest<{ User?: { Id?: string; Name?: string }; AccessToken?: string; ServerId?: string }>(base.toString(), '/Users/AuthenticateByName', undefined, {
    method: 'POST', headers: { 'X-Emby-Authorization': authHeader, Authorization: authHeader }, body: JSON.stringify({ Username: username.trim(), Pw: password }),
  });
  if (!result.User?.Id || !result.AccessToken) throw new Error('O servidor não retornou uma sessão válida.');
  return { provider, baseUrl: base.toString(), userId: result.User.Id, accessToken: result.AccessToken, serverId: result.ServerId, username: result.User.Name ?? username.trim() };
}
export async function listMediaServerLibraries(session: MediaServerSession): Promise<MediaServerLibrary[]> {
  const result = await serverRequest<{ Items?: MediaServerLibrary[] }>(session.baseUrl, `/Users/${encodeURIComponent(session.userId)}/Views`, session.accessToken);
  return result.Items ?? [];
}
export async function listMediaServerItems(session: MediaServerSession): Promise<MediaItem[]> {
  const result = await serverRequest<{ Items?: Array<Record<string, unknown>> }>(session.baseUrl, `/Users/${encodeURIComponent(session.userId)}/Items?Recursive=true&IncludeItemTypes=Movie,Series&Fields=Overview,Genres,ProductionYear,ProviderIds&Limit=500`, session.accessToken);
  return mapMediaServerItems(result.Items ?? []).map(item => ({ ...item, sourceProvider: session.provider }));
}
async function plexRequest(baseUrl: string, path: string, token: string): Promise<string> {
  const base = new URL(baseUrl.trim());
  if (base.protocol !== 'https:' && base.hostname !== 'localhost' && base.hostname !== '127.0.0.1') throw new Error('Use HTTPS para servidores Plex remotos.');
  if (!token.trim()) throw new Error('Token Plex necessário.');
  const response = await fetch(new URL(path, base), { headers: { 'X-Plex-Token': token.trim(), Accept: 'application/json, application/xml' }, signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`Plex respondeu HTTP ${response.status}.`);
  return response.text();
}
function parsePlexPayload<T>(text: string, xmlSelector: string, mapXml: (element: Element) => T): T[] {
  if (text.trim().startsWith('<')) {
    const xml = new DOMParser().parseFromString(text, 'application/xml');
    if (xml.querySelector('parsererror')) throw new Error('O Plex retornou XML inválido.');
    return Array.from(xml.querySelectorAll(xmlSelector)).map(mapXml);
  }
  return [];
}
export async function listPlexSections(baseUrl: string, token: string): Promise<PlexSection[]> {
  const text = await plexRequest(baseUrl, '/library/sections', token);
  if (text.trim().startsWith('<')) return parsePlexPayload(text, 'Directory', node => ({ key: node.getAttribute('key') ?? '', title: node.getAttribute('title') ?? 'Biblioteca', type: node.getAttribute('type') ?? '' })).filter(row => row.key);
  const parsed = JSON.parse(text) as { MediaContainer?: { Directory?: PlexSection[] } };
  return parsed.MediaContainer?.Directory ?? [];
}
export async function listPlexSectionItems(baseUrl: string, token: string, section: PlexSection): Promise<MediaItem[]> {
  const text = await plexRequest(baseUrl, `/library/sections/${encodeURIComponent(section.key)}/all`, token);
  let rows: Array<Record<string, unknown>>;
  if (text.trim().startsWith('<')) {
    rows = parsePlexPayload(text, 'Video,Directory', node => ({ ratingKey: node.getAttribute('ratingKey'), title: node.getAttribute('title'), year: node.getAttribute('year'), type: node.getAttribute('type'), summary: node.getAttribute('summary') }));
  } else {
    const parsed = JSON.parse(text) as { MediaContainer?: { Metadata?: Array<Record<string, unknown>> } };
    rows = parsed.MediaContainer?.Metadata ?? [];
  }
  return rows.flatMap(row => {
    const sourceId = String(row.ratingKey ?? ''); if (!sourceId) return [];
    const title = String(row.title ?? 'Sem título'); const year = Number(row.year);
    return [{ id: stableId(sourceId), media_type: row.type === 'show' || section.type === 'show' ? 'tv' : 'movie', title, name: title, overview: String(row.summary ?? ''), release_date: Number.isFinite(year) && year > 1800 ? `${year}-01-01` : undefined, sourceProvider: 'plex', sourceId, sourceServerId: sourceId } as MediaItem];
  });
}
