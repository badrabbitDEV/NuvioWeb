import { Router } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { asyncRoute, ApiError } from '../errors.js';
import { ensureDatabase } from '../db.js';
import { config } from '../config.js';

const router = Router();
const rangeSchema = z.enum(['24h','7d','30d']).default('7d');

function authorized(headerValue: string | undefined): boolean {
  const supplied = (headerValue ?? '').replace(/^Bearer\s+/i, '').trim();
  const expected = config.adminApiKey;
  if (!expected) return false;
  const suppliedBytes = Buffer.from(supplied, 'utf8');
  const expectedBytes = Buffer.from(expected, 'utf8');
  return suppliedBytes.length === expectedBytes.length && timingSafeEqual(suppliedBytes, expectedBytes);
}

function requireAdmin(req: { header(name: string): string | undefined }): void {
  if (!config.adminApiKey || config.adminApiKey.length < 32) {
    throw new ApiError(503, 'ADMIN_API_KEY não está configurada com pelo menos 32 caracteres.', 'ADMIN_NOT_CONFIGURED');
  }
  if (!authorized(req.header('authorization') ?? req.header('x-admin-api-key'))) {
    throw new ApiError(401, 'Chave administrativa inválida.', 'ADMIN_UNAUTHORIZED');
  }
}

router.get('/verify', (req, res, next) => {
  try { requireAdmin(req); res.json({ ok: true, role: 'admin' }); }
  catch (error) { next(error); }
});

router.get('/overview', asyncRoute(async (req, res) => {
  requireAdmin(req);
  const range = rangeSchema.parse(req.query.range);
  const interval = range === '24h' ? '24 hours' : range === '30d' ? '30 days' : '7 days';
  const db = await ensureDatabase();
  const [users, events, active, timeline, routes, recent, editions] = await Promise.all([
    db.query(`SELECT COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours')::int AS new_24h,
      COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')::int AS new_7d
      FROM nuvio_users`),
    db.query(`SELECT COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE event_name='page_view')::int AS page_views,
      COUNT(*) FILTER (WHERE event_name='player_started')::int AS player_starts,
      COUNT(*) FILTER (WHERE event_name='p2p_started')::int AS p2p_starts,
      COUNT(DISTINCT session_id)::int AS sessions
      FROM nuvio_analytics_events WHERE created_at >= NOW() - INTERVAL '${interval}'`),
    db.query(`SELECT COUNT(DISTINCT session_id)::int AS active_sessions
      FROM nuvio_analytics_events WHERE created_at >= NOW() - INTERVAL '15 minutes'`),
    db.query(`SELECT date_trunc($1, created_at) AS bucket, COUNT(*)::int AS events
      FROM nuvio_analytics_events WHERE created_at >= NOW() - INTERVAL '${interval}'
      GROUP BY 1 ORDER BY 1`, [range === '24h' ? 'hour' : 'day']),
    db.query(`SELECT COALESCE(route,'/') AS route, COUNT(*)::int AS views
      FROM nuvio_analytics_events WHERE event_name='page_view' AND created_at >= NOW() - INTERVAL '${interval}'
      GROUP BY 1 ORDER BY views DESC LIMIT 8`),
    db.query(`SELECT event_name, edition, route, media_type, provider, created_at
      FROM nuvio_analytics_events ORDER BY created_at DESC LIMIT 20`),
    db.query(`SELECT edition, COUNT(*)::int AS events,
      COUNT(*) FILTER (WHERE event_name='page_view')::int AS page_views,
      COUNT(*) FILTER (WHERE event_name='player_started')::int AS player_starts,
      COUNT(*) FILTER (WHERE event_name='p2p_started')::int AS p2p_starts
      FROM nuvio_analytics_events WHERE created_at >= NOW() - INTERVAL '${interval}' GROUP BY edition ORDER BY edition`),
  ]);
  res.json({
    range,
    database: 'connected',
    users: users.rows[0],
    analytics: { ...events.rows[0], ...active.rows[0] },
    timeline: timeline.rows,
    topRoutes: routes.rows,
    recentEvents: recent.rows,
    editions: editions.rows,
    generatedAt: new Date().toISOString(),
  });
}));

router.get('/users', asyncRoute(async (req, res) => {
  requireAdmin(req);
  const limit = Math.max(1, Math.min(100, Number(req.query.limit ?? 50) || 50));
  const db = await ensureDatabase();
  const result = await db.query(
    `SELECT LEFT(id::text,8) AS user_ref, created_at, updated_at
     FROM nuvio_users ORDER BY created_at DESC LIMIT $1`, [limit],
  );
  res.json({ users: result.rows });
}));

router.get('/events', asyncRoute(async (req, res) => {
  requireAdmin(req);
  const limit = Math.max(1, Math.min(200, Number(req.query.limit ?? 100) || 100));
  const db = await ensureDatabase();
  const result = await db.query(
    `SELECT event_name, edition, route, media_type, provider, created_at
     FROM nuvio_analytics_events ORDER BY created_at DESC LIMIT $1`, [limit],
  );
  res.json({ events: result.rows });
}));

export default router;
