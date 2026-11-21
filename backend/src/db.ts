import { Pool } from 'pg';
import { config } from './config.js';

let pool: Pool | null = null;
let initialized: Promise<void> | null = null;
export function getPool(): Pool {
  if (!config.databaseUrl) throw new Error('DATABASE_URL não configurada.');
  if (!pool) pool = new Pool({ connectionString: config.databaseUrl, ssl: config.databaseUrl.includes('localhost') ? false : { rejectUnauthorized: false }, max: 5, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 8_000 });
  return pool;
}
export async function ensureDatabase(): Promise<Pool> {
  const client = getPool();
  if (!initialized) initialized = client.query(`
    CREATE TABLE IF NOT EXISTS nuvio_users (
      id UUID PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS nuvio_user_state (
      user_id UUID PRIMARY KEY REFERENCES nuvio_users(id) ON DELETE CASCADE,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      revision BIGINT NOT NULL DEFAULT 1,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS nuvio_analytics_events (
      id UUID PRIMARY KEY,
      session_id UUID NOT NULL,
      event_name TEXT NOT NULL,
      edition TEXT NOT NULL CHECK (edition IN ('normal','enhanced')),
      route TEXT,
      media_type TEXT,
      provider TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS nuvio_analytics_events_created_idx ON nuvio_analytics_events(created_at DESC);
    CREATE INDEX IF NOT EXISTS nuvio_analytics_events_session_idx ON nuvio_analytics_events(session_id, created_at DESC);
  `).then(() => undefined).catch((error) => { initialized = null; throw error; });
  await initialized;
  return client;
}
