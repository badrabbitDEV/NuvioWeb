import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { asyncRoute, ApiError } from '../errors.js';
import { fetchAddonResource, inspectAddon } from '../services/addon-client.js';
import { safeFetchJson } from '../security/safe-fetch.js';

const router = Router();
const manifestUrl = z.string().url().max(2_048);
const inspectSchema = z.object({ manifestUrl });
const resourceSchema = z.object({
  manifestUrl,
  resource: z.enum(['catalog', 'meta', 'stream', 'subtitles']),
  type: z.string().min(1).max(32).regex(/^[a-zA-Z0-9_-]+$/),
  id: z.string().min(1).max(256),
  extra: z.record(z.string().max(160)).optional(),
});


const directorySchema = z.object({ url: z.string().url().max(2_048) });
const directoryEntrySchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().max(500).optional(),
  manifestUrl: z.string().url().max(2_048),
  adult: z.boolean().optional().default(false),
  category: z.string().max(40).optional(),
  configurable: z.boolean().optional().default(false),
}).passthrough();

router.post('/directory', asyncRoute(async (req, res) => {
  const { url } = directorySchema.parse(req.body);
  const raw = await safeFetchJson(url, false);
  const root = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const rows = Array.isArray(raw) ? raw : (Array.isArray(root.addons) ? root.addons : Array.isArray(root.items) ? root.items : null);
  if (!rows) throw new ApiError(502, 'O feed precisa conter um array "addons" ou "items".', 'INVALID_DIRECTORY_FEED');
  if (rows.length > 250) throw new ApiError(413, 'O feed excede o limite de 250 entradas.', 'DIRECTORY_TOO_LARGE');
  const blocked = /\b(adult|xxx|18\+|casino|betting|sportsbook|gambling|poker|drug|cannabis|weapon|firearm)\b/i;
  const addons = rows.flatMap((row) => {
    const parsed = directoryEntrySchema.safeParse(row);
    if (!parsed.success || parsed.data.adult || blocked.test(`${parsed.data.name} ${parsed.data.description ?? ''} ${parsed.data.category ?? ''}`)) return [];
    return [{ name: parsed.data.name, description: parsed.data.description, manifestUrl: parsed.data.manifestUrl, adult: false, category: parsed.data.category, configurable: parsed.data.configurable }];
  });
  res.json({ addons, filteredCount: rows.length - addons.length, source: new URL(url).origin });
}));

router.post('/inspect', asyncRoute(async (req, res) => {
  const input = inspectSchema.parse(req.body);
  const inspected = await inspectAddon(input.manifestUrl, config.allowHttpAddons);
  res.json({ manifest: inspected.manifest, manifestUrl: inspected.manifestUrl });
}));

router.post('/resource', asyncRoute(async (req, res) => {
  const input = resourceSchema.parse(req.body);
  const result = await fetchAddonResource({ ...input, allowHttp: config.allowHttpAddons });
  res.json(result);
}));

export default router;
