import 'dotenv/config';

const parsePort = (value: string | undefined): number => {
  const parsed = Number(value ?? 4000);
  return Number.isInteger(parsed) && parsed > 0 && parsed < 65536 ? parsed : 4000;
};

export const config = {
  port: parsePort(process.env.PORT),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  isProduction: process.env.NODE_ENV === 'production',
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:5173,http://localhost:4173')
    .split(',').map((origin) => origin.trim()).filter(Boolean),
  tmdbToken: process.env.TMDB_API_READ_TOKEN?.trim() ?? '',
  allowHttpAddons: process.env.ADDON_ALLOW_HTTP === 'true' && process.env.NODE_ENV !== 'production',
  databaseUrl: process.env.DATABASE_URL?.trim() ?? '',
  syncJwtSecret: process.env.SYNC_JWT_SECRET?.trim() ?? '',
  traktClientId: process.env.TRAKT_CLIENT_ID?.trim() ?? '',
  traktClientSecret: process.env.TRAKT_CLIENT_SECRET?.trim() ?? '',
  simklClientId: process.env.SIMKL_CLIENT_ID?.trim() ?? '',
  simklClientSecret: process.env.SIMKL_CLIENT_SECRET?.trim() ?? '',
  wetrakrClientId: process.env.WETRAKR_CLIENT_ID?.trim() ?? '',
  adminApiKey: process.env.ADMIN_API_KEY?.trim() ?? '',
  ffmpegPath: process.env.FFMPEG_PATH?.trim() || 'ffmpeg',
  mediaTranscodeEnabled: process.env.MEDIA_TRANSCODE_ENABLED === 'true',
  mediaMaxConcurrent: Math.max(1, Math.min(2, Number.parseInt(process.env.MEDIA_MAX_CONCURRENT ?? '1', 10) || 1)),
  mediaSessionTtlSeconds: Math.max(300, Math.min(7200, Number.parseInt(process.env.MEDIA_SESSION_TTL_SECONDS ?? '7200', 10) || 3600)),
  mediaMaxInputBytes: Math.max(1, Math.min(20, Number.parseInt(process.env.MEDIA_MAX_INPUT_GB ?? '12', 10) || 12)) * 1024 ** 3,
  mediaMaxDurationSeconds: Math.max(60, Math.min(10800, Number.parseInt(process.env.MEDIA_MAX_DURATION_SECONDS ?? '7200', 10) || 7200)),
  mediaMaxHeight: [480, 720, 1080].includes(Number.parseInt(process.env.MEDIA_MAX_HEIGHT ?? '720', 10)) ? Number.parseInt(process.env.MEDIA_MAX_HEIGHT ?? '720', 10) : 720,
  publicApiBaseUrl: process.env.PUBLIC_API_BASE_URL?.trim().replace(/\/$/, '') ?? '',
};
