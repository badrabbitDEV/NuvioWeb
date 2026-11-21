import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { config } from './config.js';
import { errorHandler } from './errors.js';
import catalogRoutes from './routes/catalog.js';
import addonRoutes from './routes/addons.js';
import liveRoutes from './routes/live.js';
import partyRoutes from './routes/party.js';
import accountRoutes from './routes/account.js';
import integrationRoutes from './routes/integrations.js';
import adminRoutes from './routes/admin.js';
import analyticsRoutes from './routes/analytics.js';
import mediaRoutes from './routes/media.js';

export const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({
  origin(origin, callback) {
    if (!origin || config.corsOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Origin not allowed by CORS'));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-MDBList-Key', 'X-PublicMetaDB-Key', 'X-Admin-Api-Key'],
  maxAge: 600,
}));
app.use(express.json({ limit: '2mb', strict: true }));
app.use(rateLimit({ windowMs: 60_000, limit: 90, standardHeaders: 'draft-7', legacyHeaders: false }));

app.get('/health', (_req, res) => res.json({ ok: true, service: 'nuvio-web-api', version: '1.0.4', features: { tmdb: Boolean(config.tmdbToken), addonManifestProxy: true, livePlaylistProxy: true, watchParty: true, cloudSync: Boolean(config.databaseUrl && config.syncJwtSecret), trakt: Boolean(config.traktClientId && config.traktClientSecret), simkl: Boolean(config.simklClientId && config.simklClientSecret), wetrakr: Boolean(config.wetrakrClientId), publicMetaDb: true, mdblist: true, liveTv: true, stalker: true, serverTranscoding: config.mediaTranscodeEnabled && (!config.isProduction || Boolean(config.publicApiBaseUrl)) } }));
app.get('/api/v1/health', (_req, res) => res.json({ ok: true, service: 'nuvio-web-api', version: '1.0.4', features: { tmdb: Boolean(config.tmdbToken), addonManifestProxy: true, livePlaylistProxy: true, watchParty: true, cloudSync: Boolean(config.databaseUrl && config.syncJwtSecret), trakt: Boolean(config.traktClientId && config.traktClientSecret), simkl: Boolean(config.simklClientId && config.simklClientSecret), wetrakr: Boolean(config.wetrakrClientId), publicMetaDb: true, mdblist: true, liveTv: true, stalker: true, serverTranscoding: config.mediaTranscodeEnabled && (!config.isProduction || Boolean(config.publicApiBaseUrl)) } }));
app.use('/api/v1/catalog', catalogRoutes);
app.use('/api/v1/addons', addonRoutes);
app.use('/api/v1/live', liveRoutes);
app.use('/api/v1/party', partyRoutes);
app.use('/api/v1/account', accountRoutes);
app.use('/api/v1/integrations', integrationRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/analytics', analyticsRoutes);
app.use('/api/v1/media', mediaRoutes);
app.use((_req, res) => res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Endpoint não encontrado.' } }));
app.use(errorHandler);
