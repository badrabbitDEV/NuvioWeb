import type WebTorrentClient from 'webtorrent';
import type { Torrent } from 'webtorrent';

export type P2PState = 'connecting' | 'downloading' | 'no-peers' | 'ready';

export type P2PStats = {
  state: P2PState;
  progress: number;
  downloaded: number;
  total: number;
  downloadSpeed: number;
  uploadSpeed: number;
  peers: number;
  fileName?: string;
};

type TorrentInput = string | File;
type P2PUpdate = (stats: P2PStats) => void;

const FALLBACK_TRACKERS = [
  'wss://tracker.openwebtorrent.com',
  'wss://tracker.btorrent.xyz',
  'wss://tracker.fastcast.nz',
];

let torrentClient: WebTorrentClient | null = null;
let serverReady: Promise<void> | null = null;

function configuredTrackers(): string[] {
  const configured = (import.meta.env.VITE_WEBTORRENT_TRACKERS ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  const candidates = configured.length ? configured : FALLBACK_TRACKERS;
  return [...new Set(candidates.filter((entry) => {
    try { return new URL(entry).protocol === 'wss:'; }
    catch { return false; }
  }))];
}

export function supportsBrowserP2P(): boolean {
  return typeof window !== 'undefined'
    && window.isSecureContext
    && typeof RTCPeerConnection !== 'undefined'
    && 'serviceWorker' in navigator;
}

export function isInfoHash(value: string): boolean {
  return /^[a-f0-9]{40}$/i.test(value.trim()) || /^[a-z2-7]{32}$/i.test(value.trim());
}

export function normalizeMagnet(value: string): string {
  const trimmed = value.trim();
  const trackers = configuredTrackers();
  let magnet: string;

  if (isInfoHash(trimmed)) {
    const params = new URLSearchParams({ xt: `urn:btih:${trimmed}` });
    for (const tracker of trackers) params.append('tr', tracker);
    return `magnet:?${params.toString()}`;
  }

  if (!trimmed.toLowerCase().startsWith('magnet:?')) {
    throw new Error('Informe um magnet URI ou um infoHash válido.');
  }

  magnet = trimmed;
  const params = new URLSearchParams(magnet.slice('magnet:?'.length));
  const currentTrackers = params.getAll('tr');
  const hasWebSocketTracker = currentTrackers.some((tracker) => tracker.toLowerCase().startsWith('wss://'));
  if (!hasWebSocketTracker) {
    for (const tracker of trackers) params.append('tr', tracker);
  }

  return `magnet:?${params.toString()}`;
}

async function getBrowserClient(signal: AbortSignal): Promise<WebTorrentClient> {
  if (!supportsBrowserP2P()) {
    throw new Error('P2P no navegador exige HTTPS (ou localhost), WebRTC e Service Worker.');
  }

  const { default: WebTorrent } = await import('webtorrent');
  if (!WebTorrent.WEBRTC_SUPPORT) {
    throw new Error('Este navegador não oferece suporte WebRTC necessário ao WebTorrent.');
  }
  if (signal.aborted) throw new DOMException('Reprodução cancelada.', 'AbortError');

  const base = new URL(import.meta.env.BASE_URL, window.location.origin);
  const scope = base.pathname.endsWith('/') ? base.pathname : `${base.pathname}/`;
  const workerUrl = `${scope}sw.min.js`;
  const registration = await navigator.serviceWorker.register(workerUrl, { scope });
  const readyRegistration = await navigator.serviceWorker.ready;
  if (signal.aborted) throw new DOMException('Reprodução cancelada.', 'AbortError');

  if (!torrentClient) torrentClient = new WebTorrent({ maxConns: 48 });
  if (!serverReady) {
    serverReady = Promise.resolve().then(() => {
      if (!torrentClient) throw new Error('Cliente P2P indisponível.');
      torrentClient.createServer({ controller: readyRegistration ?? registration }, 'browser');
    });
  }
  await serverReady;
  return torrentClient;
}

function isVideoFile(fileName: string): boolean {
  return /\.(mp4|m4v|webm|ogv|ogg|mov|mkv|avi)$/i.test(fileName);
}

function currentStats(torrent: Torrent, fileName?: string): P2PStats {
  return {
    state: torrent.numPeers > 0 ? 'downloading' : 'no-peers',
    progress: Number.isFinite(torrent.progress) ? torrent.progress : 0,
    downloaded: torrent.downloaded,
    total: torrent.length,
    downloadSpeed: torrent.downloadSpeed,
    uploadSpeed: torrent.uploadSpeed,
    peers: torrent.numPeers,
    fileName,
  };
}

/**
 * Streams a user-supplied or addon-provided torrent into an HTMLVideoElement.
 * Browser peers use WebRTC; ordinary TCP/UDP BitTorrent peers are not reachable here.
 */
export async function streamTorrentToVideo(
  input: TorrentInput,
  video: HTMLVideoElement,
  fileIdx: number | undefined,
  onUpdate: P2PUpdate,
  signal: AbortSignal,
): Promise<void> {
  let client: WebTorrentClient | null = null;
  let torrent: Torrent | null = null;
  let updateStats: (() => void) | null = null;

  try {
    client = await getBrowserClient(signal);
    if (signal.aborted) return;

    const trackers = configuredTrackers();
    const torrentId = typeof input === 'string' ? normalizeMagnet(input) : input;
    torrent = client.add(torrentId, { announce: trackers, strategy: 'sequential' });

    onUpdate({
      state: 'connecting', progress: 0, downloaded: 0, total: 0,
      downloadSpeed: 0, uploadSpeed: 0, peers: 0,
    });

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const cleanup = () => {
        signal.removeEventListener('abort', onAbort);
        torrent?.removeListener('ready', onReady);
        torrent?.removeListener('error', onError);
      };
      const onReady = () => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve();
      };
      const onError = (error: Error | string) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(error instanceof Error ? error : new Error(String(error)));
      };
      const onAbort = () => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new DOMException('Reprodução cancelada.', 'AbortError'));
      };

      if (torrent?.ready) onReady();
      else {
        torrent?.once('ready', onReady);
        torrent?.once('error', onError);
        signal.addEventListener('abort', onAbort, { once: true });
      }
    });

    if (signal.aborted || !torrent) return;

    const selectedFile = typeof fileIdx === 'number' && Number.isInteger(fileIdx)
      ? torrent.files[fileIdx]
      : undefined;
    const file = selectedFile ?? torrent.files.find((entry) => isVideoFile(entry.name));
    if (!file) throw new Error('O torrent abriu, mas não contém um arquivo de vídeo reconhecido.');

    file.streamTo(video);
    video.load();
    onUpdate({ ...currentStats(torrent, file.name), state: 'ready' });

    updateStats = () => onUpdate(currentStats(torrent!, file.name));
    torrent.on('download', updateStats);
    torrent.on('upload', updateStats);
    torrent.on('noPeers', updateStats);
    await new Promise<void>((resolve) => {
      if (signal.aborted) resolve();
      else signal.addEventListener('abort', () => resolve(), { once: true });
    });
  } finally {
    if (torrent && updateStats) {
      torrent.removeListener('download', updateStats);
      torrent.removeListener('upload', updateStats);
      torrent.removeListener('noPeers', updateStats);
    }
    video.pause();
    if ((video.currentSrc || video.src).includes('/webtorrent/')) {
      video.removeAttribute('src');
      video.load();
    }
    if (client && torrent) {
      await client.remove(torrent, { destroyStore: true }).catch(() => undefined);
    }
  }
}


export type P2PSeedSession = {
  magnetURI: string;
  infoHash: string;
  fileName: string;
  stop: () => Promise<void>;
};

/** Shares a file selected by the user as a WebTorrent WebRTC seed. */
export async function seedLocalFile(file: File, onUpdate: P2PUpdate): Promise<P2PSeedSession> {
  if (!file.size) throw new Error('O arquivo está vazio.');
  if (file.size > 2 * 1024 * 1024 * 1024) throw new Error('O compartilhamento pelo navegador está limitado a 2 GB por arquivo.');
  const controller = new AbortController();
  const client = await getBrowserClient(controller.signal);
  const trackers = configuredTrackers();
  const torrent = await new Promise<Torrent>((resolve,reject) => {
    let settled=false;
    const onError=(error:Error|string)=>{if(settled)return;settled=true;reject(error instanceof Error?error:new Error(String(error)));};
    try {
      const created=client.seed(file,{announce:trackers,uploads:32},(readyTorrent)=>{
        if(settled)return;settled=true;resolve(readyTorrent);
      });
      created.once('error',onError);
    } catch(error) { reject(error instanceof Error?error:new Error('Falha ao iniciar seed WebTorrent.')); }
  });
  const update=()=>onUpdate({...currentStats(torrent,file.name),state:'ready'});
  torrent.on('upload',update);
  torrent.on('wire',update);
  update();
  let stopped=false;
  return {
    magnetURI:torrent.magnetURI,
    infoHash:torrent.infoHash,
    fileName:file.name,
    stop:async()=>{
      if(stopped)return;
      stopped=true;
      torrent.removeListener('upload',update);
      torrent.removeListener('wire',update);
      await client.remove(torrent,{destroyStore:true}).catch(()=>undefined);
    },
  };
}

export function formatP2PBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / (1024 ** index)).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

export function formatP2PSpeed(bytesPerSecond: number): string {
  return `${formatP2PBytes(bytesPerSecond)}/s`;
}
