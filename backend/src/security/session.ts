import { createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { config } from '../config.js';
import { ApiError } from '../errors.js';
const scrypt = promisify(scryptCallback);
type SessionPayload = { sub: string; exp: number; iat: number };

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const key = await scrypt(password, salt, 64) as Buffer;
  return `scrypt$${salt}$${key.toString('hex')}`;
}
export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [algorithm, salt, hash] = encoded.split('$');
  if (algorithm !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'hex');
  const actual = await scrypt(password, salt, expected.length) as Buffer;
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
function secret(): string {
  const value = config.syncJwtSecret;
  if (!value || value.length < 32) throw new ApiError(503, 'SYNC_JWT_SECRET precisa ter ao menos 32 caracteres.', 'SYNC_NOT_CONFIGURED');
  return value;
}
const b64 = (value: string) => Buffer.from(value).toString('base64url');
export function createSession(userId: string): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = { sub: userId, iat: now, exp: now + 14 * 24 * 60 * 60 };
  const header = b64(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64(JSON.stringify(payload));
  const signature = createHmac('sha256', secret()).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${signature}`;
}
export function verifySession(token: string): SessionPayload {
  const parts = token.split('.');
  if (parts.length !== 3) throw new ApiError(401, 'Sessão inválida.', 'INVALID_SESSION');
  const [header, body, signature] = parts;
  const expected = createHmac('sha256', secret()).update(`${header}.${body}`).digest();
  const actual = Buffer.from(signature, 'base64url');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new ApiError(401, 'Sessão inválida.', 'INVALID_SESSION');
  let payload: SessionPayload;
  try { payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as SessionPayload; }
  catch { throw new ApiError(401, 'Sessão inválida.', 'INVALID_SESSION'); }
  if (!payload.sub || !payload.exp || payload.exp < Math.floor(Date.now() / 1000)) throw new ApiError(401, 'Sua sessão expirou. Entre novamente.', 'SESSION_EXPIRED');
  return payload;
}
export function requireUserId(authorization: string | undefined): string {
  if (!authorization?.startsWith('Bearer ')) throw new ApiError(401, 'Autenticação necessária.', 'AUTH_REQUIRED');
  return verifySession(authorization.slice(7).trim()).sub;
}
