import { Router, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { z } from 'zod';
import { config } from '../config.js';
import { ApiError, asyncRoute } from '../errors.js';
import { openSafeResponse } from '../security/safe-fetch.js';

const router = Router();
const startLimiter = rateLimit({
  windowMs: 10 * 60_000,
  limit: 4,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: { code: 'TRANSCODE_RATE_LIMIT', message: 'Muitas solicitações de conversão. Tente novamente mais tarde.' } },
});

const startSchema = z.object({
  url: z.string().url().max(2048),
  // HLS playlists are deliberately excluded: their nested segment URLs need a separate
  // manifest-aware, SSRF-safe fetcher. HLS is played directly by hls.js when possible.
}).strict();

type TranscodeSession = {
  id: string;
  directory: string;
  child: ChildProcess;
  createdAt: number;
  lastAccessAt: number;
  expiresAt: number;
  completed: boolean;
  exitCode: number | null;
  failed: boolean;
  stop: () => Promise<void>;
};

const sessions = new Map<string, TranscodeSession>();
let pendingStarts = 0;
const SESSION_ID_PATTERN = /^[a-f0-9]{48}$/;
const SEGMENT_PATTERN = /^segment_[0-9]{6,9}\.ts$/;

function noStore(res: Response): void {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('X-Content-Type-Options', 'nosniff');
}

async function removeSession(id: string, kill = true): Promise<void> {
  const session = sessions.get(id);
  if (!session) return;
  sessions.delete(id);
  if (kill && !session.completed) {
    const exited = once(session.child, 'close').catch(() => undefined);
    session.child.kill('SIGTERM');
    await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 1500))]);
    if (!session.completed) {
      const forceExit = once(session.child, 'close').catch(() => undefined);
      session.child.kill('SIGKILL');
      await Promise.race([forceExit, new Promise((resolve) => setTimeout(resolve, 1000))]);
    }
  }
  await session.stop().catch(() => undefined);
  await rm(session.directory, { recursive: true, force: true }).catch(() => undefined);
}

const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (session.expiresAt <= now || (session.completed && now - session.lastAccessAt > 10 * 60_000)) {
      void removeSession(id, !session.completed);
    }
  }
}, 60_000);
cleanupTimer.unref();

function makeFfmpegArgs(directory: string): string[] {
  const segmentPattern = join(directory, 'segment_%06d.ts');
  return [
    '-hide_banner', '-loglevel', 'error', '-nostdin',
    '-i', 'pipe:0',
    '-t', String(config.mediaMaxDurationSeconds),
    '-map', '0:v:0', '-map', '0:a:0?', '-sn', '-dn',
    '-vf', `scale=-2:'min(${config.mediaMaxHeight},ih)'`,
    '-c:v', 'libx264', '-preset', 'veryfast', '-threads', '2', '-g', '120', '-sc_threshold', '0', '-force_key_frames', 'expr:gte(t,n_forced*4)', '-crf', '24',
    '-pix_fmt', 'yuv420p', '-maxrate', '3500k', '-bufsize', '7000k',
    '-c:a', 'aac', '-b:a', '128k', '-ac', '2',
    '-f', 'hls', '-hls_time', '4', '-hls_list_size', '0',
    '-hls_flags', 'independent_segments+temp_file',
    '-hls_segment_filename', segmentPattern,
    join(directory, 'index.m3u8'),
  ];
}

async function waitForPlaylist(session: TranscodeSession, timeoutMs = 25_000): Promise<void> {
  const playlist = join(session.directory, 'index.m3u8');
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (session.failed || (session.completed && session.exitCode !== 0)) {
      throw new ApiError(502, 'O servidor não conseguiu decodificar esta fonte. Tente outra fonte ou um formato compatível.', 'TRANSCODE_FAILED');
    }
    try {
      const info = await stat(playlist);
      if (info.size > 0) return;
    } catch { /* FFmpeg ainda está preparando os primeiros segmentos. */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new ApiError(504, 'A conversão demorou demais para iniciar. Tente uma fonte mais leve.', 'TRANSCODE_START_TIMEOUT');
}

router.post('/transcode', startLimiter, asyncRoute(async (req, res) => {
  if (!config.mediaTranscodeEnabled) {
    throw new ApiError(503, 'A conversão no servidor está desativada. Configure MEDIA_TRANSCODE_ENABLED=true e instale FFmpeg no serviço.', 'TRANSCODE_DISABLED');
  }
  if (config.isProduction && !config.publicApiBaseUrl) {
    throw new ApiError(503, 'Configure PUBLIC_API_BASE_URL com a URL HTTPS pública da API antes de ativar a conversão.', 'TRANSCODE_PUBLIC_URL_MISSING');
  }
  if (sessions.size + pendingStarts >= config.mediaMaxConcurrent) {
    throw new ApiError(429, 'O servidor já está usando toda a capacidade de conversão disponível.', 'TRANSCODE_CAPACITY');
  }
  pendingStarts += 1;
  let reservationHeld = true;
  try {
    const baseText = config.publicApiBaseUrl || `${req.protocol}://${req.get('host')}`;
    let publicBase: URL;
    try { publicBase = new URL(baseText); }
    catch { throw new ApiError(503, 'PUBLIC_API_BASE_URL contém uma URL inválida.', 'TRANSCODE_PUBLIC_URL_INVALID'); }
    if ((config.isProduction && publicBase.protocol !== 'https:') || publicBase.username || publicBase.password || publicBase.search || publicBase.hash) {
      throw new ApiError(503, 'Configure PUBLIC_API_BASE_URL com uma origem HTTPS pública, sem credenciais ou parâmetros.', 'TRANSCODE_HTTPS_REQUIRED');
    }

    const input = startSchema.parse(req.body);
    const upstream = await openSafeResponse(input.url, false);
    const contentType = (upstream.response.headers.get('content-type') ?? '').split(';', 1)[0].trim().toLowerCase();
    const contentLength = Number(upstream.response.headers.get('content-length') ?? 0);
    const isHls = /mpegurl|\.m3u8(?:$|\?)/i.test(contentType) || /\.m3u8(?:$|\?)/i.test(input.url);
    if (isHls) {
      await upstream.response.body?.cancel().catch(() => undefined);
      await upstream.close();
      throw new ApiError(415, 'Fontes HLS não precisam deste fallback e não são reempacotadas por esta rota. O player web deve usar hls.js.', 'TRANSCODE_HLS_UNSUPPORTED');
    }
    const allowedContentType = contentType.startsWith('video/')
      || contentType === 'application/octet-stream'
      || contentType === 'application/mp4'
      || contentType === 'binary/octet-stream';
    if (!allowedContentType) {
      await upstream.response.body?.cancel().catch(() => undefined);
      await upstream.close();
      throw new ApiError(415, 'A fonte não informou um tipo de mídia de vídeo compatível para conversão.', 'TRANSCODE_UNSUPPORTED_CONTENT');
    }
    if (!upstream.response.body) {
      await upstream.close();
      throw new ApiError(502, 'A fonte de mídia retornou um corpo vazio.', 'TRANSCODE_EMPTY_SOURCE');
    }
    if (contentLength > config.mediaMaxInputBytes) {
      await upstream.response.body.cancel().catch(() => undefined);
      await upstream.close();
      throw new ApiError(413, 'A fonte excede o limite de tamanho configurado para conversão.', 'TRANSCODE_SOURCE_TOO_LARGE');
    }

    const directory = await mkdtemp(join(tmpdir(), 'nuvio-media-'));
    const id = randomBytes(24).toString('hex');
    let child: ChildProcess;
    try {
      child = spawn(config.ffmpegPath, makeFfmpegArgs(directory), {
        stdio: ['pipe', 'ignore', 'pipe'],
        windowsHide: true,
      });
    } catch {
      await upstream.response.body.cancel().catch(() => undefined);
      await upstream.close();
      await rm(directory, { recursive: true, force: true });
      throw new ApiError(503, 'FFmpeg não está instalado ou não pode ser iniciado no servidor.', 'FFMPEG_UNAVAILABLE');
    }

    const session: TranscodeSession = {
      id, directory, child, createdAt: Date.now(), lastAccessAt: Date.now(),
      expiresAt: Date.now() + config.mediaSessionTtlSeconds * 1000,
      completed: false, exitCode: null, failed: false,
      stop: async () => {
        await upstream.response.body?.cancel().catch(() => undefined);
        await upstream.close();
      },
    };
    sessions.set(id, session);
    pendingStarts -= 1;
    reservationHeld = false;
    const ffmpegInput = child.stdin;
    if (!ffmpegInput) {
      sessions.delete(id);
      await upstream.response.body.cancel().catch(() => undefined);
      child.kill('SIGTERM');
      await upstream.close();
      await rm(directory, { recursive: true, force: true });
      throw new ApiError(503, 'FFmpeg não abriu o canal de entrada.', 'FFMPEG_PIPE_UNAVAILABLE');
    }
    child.stderr?.on('data', () => { /* Never log provider URLs, headers, or media contents. */ });
    child.on('error', () => { session.failed = true; session.completed = true; });
    child.on('exit', (code) => {
      session.completed = true;
      session.exitCode = code;
      if (code !== 0) session.failed = true;
    });
    child.on('close', (code) => {
      session.completed = true;
      session.exitCode = code;
      if (code !== 0) session.failed = true;
      void upstream.close();
    });

    const onResponseClose = () => {
      if (!res.writableEnded) void removeSession(id, true);
    };
    res.once('close', onResponseClose);

    const source = Readable.fromWeb(upstream.response.body as never);
    let bytesReceived = 0;
    const byteLimit = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        bytesReceived += chunk.byteLength;
        if (bytesReceived > config.mediaMaxInputBytes) {
          callback(new ApiError(413, 'A fonte ultrapassou o limite de tamanho configurado.', 'TRANSCODE_SOURCE_TOO_LARGE'));
          return;
        }
        callback(null, chunk);
      },
    });
    void pipeline(source, byteLimit, ffmpegInput).catch(async () => {
      // FFmpeg closes stdin itself when the configured output-duration cap is reached.
      // Give its successful exit a short window before treating the closed pipe as a failure.
      if (!session.completed) {
        await Promise.race([
          once(child, 'close').catch(() => undefined),
          new Promise((resolve) => setTimeout(resolve, 1000)),
        ]);
      }
      if (!session.completed || session.exitCode !== 0) {
        session.failed = true;
        if (!session.completed) child.kill('SIGTERM');
      }
      void upstream.close();
    });

    try {
      await waitForPlaylist(session);
    } catch (error) {
      await removeSession(id, true);
      throw error;
    }

    const playlistUrl = new URL(`/api/v1/media/sessions/${id}/index.m3u8`, publicBase).toString();
    noStore(res);
    res.status(201).json({ sessionId: id, playlistUrl, expiresAt: new Date(session.expiresAt).toISOString(), engine: 'ffmpeg-server' });
    res.off('close', onResponseClose);
  } catch (error) {
    if (reservationHeld) pendingStarts = Math.max(0, pendingStarts - 1);
    throw error;
  }
}));

router.get('/sessions/:id/:file', asyncRoute(async (req, res) => {
  const { id, file } = req.params;
  if (!SESSION_ID_PATTERN.test(id) || !(file === 'index.m3u8' || SEGMENT_PATTERN.test(file))) {
    throw new ApiError(404, 'Segmento de mídia não encontrado.', 'MEDIA_NOT_FOUND');
  }
  const session = sessions.get(id);
  if (!session || session.expiresAt <= Date.now()) {
    if (session) await removeSession(id, !session.completed);
    throw new ApiError(404, 'A sessão de conversão expirou.', 'MEDIA_SESSION_EXPIRED');
  }
  session.lastAccessAt = Date.now();
  const path = join(session.directory, file);
  try { await stat(path); }
  catch {
    if (session.failed) throw new ApiError(502, 'A conversão foi interrompida pelo servidor.', 'TRANSCODE_FAILED');
    res.status(425).setHeader('Retry-After', '2').end();
    return;
  }
  noStore(res);
  res.setHeader('Content-Type', file.endsWith('.m3u8') ? 'application/vnd.apple.mpegurl' : 'video/mp2t');
  res.setHeader('Content-Disposition', 'inline');
  createReadStream(path).on('error', () => {
    if (!res.headersSent) res.status(404).end();
    else res.destroy();
  }).pipe(res);
}));

router.delete('/sessions/:id', asyncRoute(async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!SESSION_ID_PATTERN.test(id)) throw new ApiError(404, 'Sessão não encontrada.', 'MEDIA_NOT_FOUND');
  await removeSession(id, true);
  res.status(204).end();
}));

export default router;
    
