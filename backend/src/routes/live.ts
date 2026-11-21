import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { ApiError, asyncRoute } from '../errors.js';
import { safeFetchJson, safeFetchText } from '../security/safe-fetch.js';

const router = Router();
const sourceSchema = z.object({ url: z.string().url().max(2048), kind: z.enum(['m3u', 'xmltv']) });
router.post('/fetch', asyncRoute(async (req, res) => {
  const input = sourceSchema.parse(req.body);
  const maxBytes = input.kind === 'm3u' ? 8 * 1024 * 1024 : 20 * 1024 * 1024;
  const content = await safeFetchText(input.url, config.allowHttpAddons, maxBytes);
  res.json({ content, bytes: Buffer.byteLength(content, 'utf8'), kind: input.kind });
}));

const stalkerSchema = z.object({
  portalUrl: z.string().url().max(2048),
  mac: z.string().regex(/^(?:[0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/),
  action: z.enum(['handshake','profile','genres','channels','create_link','epg']),
  token: z.string().regex(/^[A-Za-z0-9._~+\/-]{8,4096}$/).optional(),
  cmd: z.string().max(4096).optional(),
  channelId: z.string().max(128).optional(),
}).strict();

function stalkerApiUrl(portalUrl: string, params: Record<string,string>): string {
  const url = new URL(portalUrl);
  if (url.protocol !== 'https:' && !(config.allowHttpAddons && url.protocol === 'http:')) {
    throw new ApiError(400,'O portal Stalker precisa usar HTTPS. HTTP só é permitido quando ADDON_ALLOW_HTTP=true na Render.','HTTPS_REQUIRED');
  }
  for (const [key,value] of Object.entries(params)) url.searchParams.set(key,value);
  url.searchParams.set('JsHttpRequest','1-xml');
  return url.toString();
}

function stalkerJsonPayload(payload: unknown): any {
  if (!payload || typeof payload !== 'object') return payload;
  const record = payload as Record<string,unknown>;
  if (typeof record.js === 'string') {
    try { return JSON.parse(record.js) as unknown; } catch { return record.js; }
  }
  return record.js ?? payload;
}

router.post('/stalker', asyncRoute(async (req, res) => {
  const input = stalkerSchema.parse(req.body);
  const portal = new URL(input.portalUrl);
  const headers: Record<string,string> = {
    cookie: `mac=${input.mac}; stb_lang=en; timezone=GMT`,
    'x-user-agent': 'Model: MAG254; Link: Ethernet',
  };
  if (input.token) headers.authorization = `Bearer ${input.token}`;
  const actionParams: Record<string,string> = { type: 'stb', action: 'handshake' };
  if (input.action === 'profile') Object.assign(actionParams,{type:'stb',action:'get_profile'});
  if (input.action === 'genres') Object.assign(actionParams,{type:'itv',action:'get_genres'});
  if (input.action === 'channels') Object.assign(actionParams,{type:'itv',action:'get_all_channels'});
  if (input.action === 'create_link') {
    if (!input.cmd) throw new ApiError(400,'Comando do canal ausente.','STALKER_CMD_REQUIRED');
    Object.assign(actionParams,{type:'itv',action:'create_link',cmd:input.cmd});
  }
  if (input.action === 'epg') {
    if (!input.channelId) throw new ApiError(400,'Identificador do canal ausente.','STALKER_CHANNEL_REQUIRED');
    Object.assign(actionParams,{type:'itv',action:'get_short_epg',ch_id:input.channelId,period:'24'});
  }
  const url = stalkerApiUrl(input.portalUrl,actionParams);
  const payload = await safeFetchJson(url,config.allowHttpAddons,headers);
  const js = stalkerJsonPayload(payload);
  let streamUrl: string | undefined;
  if (input.action === 'create_link') {
    const raw = typeof js === 'string' ? js : (js && typeof js === 'object' ? String((js as Record<string,unknown>).cmd ?? (js as Record<string,unknown>).url ?? '') : '');
    streamUrl = raw.replace(/^ffmpeg\s+/i,'').trim() || undefined;
    if (streamUrl) { try { const parsed = new URL(streamUrl); if (!['https:','http:'].includes(parsed.protocol)) streamUrl = undefined; } catch { streamUrl = undefined; } }
  }
  res.json({ action:input.action, payload, data:js, streamUrl, portalHost:portal.host });
}));

export default router;
