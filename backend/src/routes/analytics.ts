import { Router } from 'express';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { asyncRoute } from '../errors.js';
import { ensureDatabase } from '../db.js';

const router = Router();
const eventSchema = z.object({
  sessionId: z.string().uuid(),
  name: z.enum(['page_view','addon_installed','addon_removed','player_started','p2p_started','live_tv_opened','search_used','edition_changed','account_created']),
  edition: z.enum(['normal','enhanced']).default('normal'),
  route: z.string().max(48).regex(/^\/[a-z0-9/_-]*$/i).optional(),
  mediaType: z.enum(['movie','tv','series','channel','other']).optional(),
  provider: z.string().max(32).regex(/^[a-z0-9_-]+$/i).optional(),
}).strict();

router.post('/event', asyncRoute(async (req, res) => {
  const input = eventSchema.parse(req.body);
  // Analytics is opt-in at the client. No IP address, query text, media ID, tokens or full URL is stored.
  const db = await ensureDatabase();
  await db.query(
    `INSERT INTO nuvio_analytics_events (id, session_id, event_name, edition, route, media_type, provider)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [randomUUID(), input.sessionId, input.name, input.edition, input.route ?? null, input.mediaType ?? null, input.provider ?? null],
  );
  res.status(202).json({ accepted: true });
}));

export default router;
