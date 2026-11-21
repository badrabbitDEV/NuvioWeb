import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { ApiError, asyncRoute } from '../errors.js';
import { ensureDatabase } from '../db.js';
import { createSession, hashPassword, requireUserId, verifyPassword } from '../security/session.js';

const router = Router();
const credentialLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 8,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: { code: 'AUTH_RATE_LIMIT', message: 'Muitas tentativas de autenticação. Aguarde antes de tentar novamente.' } },
});
const credentialsSchema = z.object({ email: z.string().trim().email().max(254), password: z.string().min(10).max(128) });
const stateSchema = z.object({
  edition: z.enum(['normal','enhanced']).optional(),
  addons: z.array(z.record(z.unknown())).max(100).optional(),
  library: z.array(z.record(z.unknown())).max(5000).optional(),
  profiles: z.array(z.record(z.unknown())).max(8).optional(),
  settings: z.record(z.unknown()).optional(),
  collections: z.array(z.record(z.unknown())).max(500).optional(),
  progress: z.array(z.record(z.unknown())).max(5000).optional(),
  profileStates: z.record(z.record(z.unknown())).optional(),
  updatedAt: z.number().optional(),
  activeProfileId: z.string().max(64).optional(),
}).strict();

router.post('/register', credentialLimiter, asyncRoute(async (req, res) => {
  const { email, password } = credentialsSchema.parse(req.body);
  if (password.toLowerCase().includes(email.split('@')[0].toLowerCase())) throw new ApiError(400, 'A senha não deve conter o início do e-mail.', 'WEAK_PASSWORD');
  const db = await ensureDatabase();
  const id = randomUUID();
  const token = createSession(id);
  try {
    await db.query('INSERT INTO nuvio_users (id,email,password_hash) VALUES ($1,$2,$3)', [id,email.toLowerCase(),await hashPassword(password)]);
    await db.query('INSERT INTO nuvio_user_state (user_id,payload) VALUES ($1,$2::jsonb)', [id,JSON.stringify({})]);
  } catch (error) {
    if ((error as { code?: string }).code === '23505') throw new ApiError(409, 'Este e-mail já possui uma conta.', 'EMAIL_EXISTS');
    throw error;
  }
  res.status(201).json({ token, user: { id, email: email.toLowerCase() } });
}));

router.post('/login', credentialLimiter, asyncRoute(async (req, res) => {
  const { email, password } = credentialsSchema.parse(req.body);
  const db = await ensureDatabase();
  const result = await db.query('SELECT id,email,password_hash FROM nuvio_users WHERE email=$1 LIMIT 1', [email.toLowerCase()]);
  const user = result.rows[0] as { id: string; email: string; password_hash: string } | undefined;
  if (!user || !(await verifyPassword(password,user.password_hash))) throw new ApiError(401, 'E-mail ou senha incorretos.', 'INVALID_CREDENTIALS');
  res.json({ token: createSession(user.id), user: { id: user.id, email: user.email } });
}));

router.get('/me', asyncRoute(async (req, res) => {
  const userId = requireUserId(req.header('authorization'));
  const db = await ensureDatabase();
  const result = await db.query('SELECT id,email,created_at FROM nuvio_users WHERE id=$1 LIMIT 1',[userId]);
  if (!result.rowCount) throw new ApiError(404,'Conta não encontrada.','USER_NOT_FOUND');
  res.json({ user: result.rows[0] });
}));

router.get('/sync', asyncRoute(async (req, res) => {
  const userId = requireUserId(req.header('authorization'));
  const db = await ensureDatabase();
  const result = await db.query('SELECT payload,revision,updated_at FROM nuvio_user_state WHERE user_id=$1',[userId]);
  res.json({ state: result.rows[0]?.payload ?? {}, revision: Number(result.rows[0]?.revision ?? 0), updatedAt: result.rows[0]?.updated_at ?? null });
}));

router.put('/sync', asyncRoute(async (req, res) => {
  const userId = requireUserId(req.header('authorization'));
  const input = stateSchema.parse(req.body);
  const encoded = JSON.stringify(input);
  if (Buffer.byteLength(encoded,'utf8') > 1_500_000) throw new ApiError(413,'O estado de sincronização excede 1,5 MB.','SYNC_TOO_LARGE');
  const db = await ensureDatabase();
  const result = await db.query(`INSERT INTO nuvio_user_state (user_id,payload,revision,updated_at)
    VALUES ($1,$2::jsonb,1,NOW()) ON CONFLICT (user_id) DO UPDATE SET payload=EXCLUDED.payload,revision=nuvio_user_state.revision+1,updated_at=NOW()
    RETURNING revision,updated_at`,[userId,encoded]);
  res.json({ ok:true, revision:Number(result.rows[0].revision), updatedAt:result.rows[0].updated_at });
}));

router.delete('/account', asyncRoute(async (req, res) => {
  const userId = requireUserId(req.header('authorization'));
  const db = await ensureDatabase();
  await db.query('DELETE FROM nuvio_users WHERE id=$1',[userId]);
  res.json({ ok:true });
}));

export default router;
    
