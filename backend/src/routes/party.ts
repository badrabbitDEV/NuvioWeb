import { Router } from 'express';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { ApiError, asyncRoute } from '../errors.js';

const router = Router();
const activeCodes = new Set<string>();
const createSchema = z.object({ displayName: z.string().trim().min(1).max(32) });
router.post('/rooms', asyncRoute(async (req, res) => {
  const { displayName } = createSchema.parse(req.body);
  let code = '';
  for (let i = 0; i < 5; i++) {
    code = randomBytes(4).toString('base64url').slice(0, 7).toUpperCase();
    if (!activeCodes.has(code)) break;
  }
  if (!code || activeCodes.has(code)) throw new ApiError(503, 'Não foi possível criar uma sala agora.', 'PARTY_CAPACITY');
  activeCodes.add(code);
  setTimeout(() => activeCodes.delete(code), 12 * 60 * 60 * 1000).unref();
  res.status(201).json({ code, displayName, websocketPath: `/ws/party/${code}` });
}));
router.get('/rooms/:code', (req, res) => {
  const code = String(req.params.code ?? '').toUpperCase();
  if (!/^[A-Z0-9_-]{5,12}$/.test(code) || !activeCodes.has(code)) return res.status(404).json({ error: { code: 'PARTY_NOT_FOUND', message: 'Sala não encontrada ou expirada.' } });
  return res.json({ code, exists: true });
});
export function isActivePartyCode(code: string): boolean { return activeCodes.has(code); }
export default router;
