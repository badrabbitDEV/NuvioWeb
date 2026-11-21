import { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { ArrowLeft, Gauge, Info, Maximize, MonitorPlay, Pause, PictureInPicture2, Play, Volume2, Network } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { CSSProperties } from 'react';
import type { InstalledAddon, MediaItem, Stream } from '../types';
import { useApp } from '../lib/context';
import { formatP2PBytes, formatP2PSpeed, streamTorrentToVideo, type P2PStats } from '../lib/p2p';
import { resolveSubtitleUrl } from '../lib/subtitles';
import { sendPartyMessage, subscribeParty } from '../lib/party-client';
import { saveWatchProgress } from '../lib/progress';
import { api } from '../lib/api';
import { sendTraktScrobble } from '../features/tracking';
import { trackEvent } from '../lib/analytics';
import { getAndroidNativeBridge, launchAndroidNativePlayer } from '../lib/native-player';

type PlayerRouteState = {
  stream?: Stream;
  mediaTitle?: string;
  mediaKey?: string;
  torrentFile?: File;
  mediaItem?: MediaItem;
  offline?: boolean;
  tracking?: { movie?: Record<string, unknown>; episode?: Record<string, unknown>; show?: Record<string, unknown> };
  nextEpisode?: { type: 'tv'; id: number; season: number; episode: number; title: string; episodeCount?: number; imdbId?: string; addons: InstalledAddon[] };
};

export default function Player() {
  const location = useLocation();
  const navigate = useNavigate();
  const { edition, settings, activeProfileId } = useApp();
  const state = location.state as PlayerRouteState | null;
  const stream = state?.stream;
  const torrentInput = state?.torrentFile
    ?? (stream?.url?.toLowerCase().startsWith('magnet:') ? stream.url : stream?.infoHash);
  const isP2P = Boolean(torrentInput);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [error, setError] = useState('');
  const [nextBusy, setNextBusy] = useState(false);
  const [qualities, setQualities] = useState<Array<{ value: number; label: string }>>([]);
  const [audioTracks,setAudioTracks]=useState<Array<{value:number;label:string}>>([]);
  const [audioTrack,setAudioTrack]=useState(-1);
  const [skipTarget,setSkipTarget]=useState<number|null>(null);
  const [skipLabel,setSkipLabel]=useState<'abertura'|'créditos'>('abertura');
  const [selectedSubtitle,setSelectedSubtitle]=useState(-1);
  const [heardAt,setHeardAt]=useState<number|null>(null);
  const [subtitleSyncMessage,setSubtitleSyncMessage]=useState('');
  const [quality, setQuality] = useState(-1);
  const [showInfo, setShowInfo] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(settings.playbackSpeed);
  const [subtitleOffset, setSubtitleOffset] = useState(0);
  const [subtitleSources, setSubtitleSources] = useState<Array<{ src: string; lang: string; label: string }>>([]);
  const remoteSyncRef = useRef(false);
  const [p2pStats, setP2pStats] = useState<P2PStats | null>(null);
  const [serverDecode, setServerDecode] = useState(false);
  const [nativePlayback, setNativePlayback] = useState(false);
  const [forceWebPlayback, setForceWebPlayback] = useState(false);
  const lastProgressSave = useRef(0);
  const lastScrobble = useRef({ action: '', at: 0 });
  const lastWeTrakrScrobble = useRef({ action: '', at: 0 });
  const lastPublicMetaDbSave = useRef(0);
  const publicMetaDbCompleted = useRef(false);
  const playStartTracked = useRef(false);

  useEffect(() => { setSpeed(settings.playbackSpeed); if (videoRef.current) videoRef.current.playbackRate = settings.playbackSpeed; }, [settings.playbackSpeed]);

  useEffect(() => {
    const offlineUrl = state?.offline && stream?.url?.startsWith('blob:') ? stream.url : '';
    return () => { if (offlineUrl) URL.revokeObjectURL(offlineUrl); };
  }, [state?.offline, stream?.url]);

  useEffect(() => { playStartTracked.current = false; setForceWebPlayback(false); }, [state?.mediaKey, stream?.url, stream?.infoHash, torrentInput]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !stream || (!stream.url && !torrentInput)) return;
    let hls: Hls | null = null;
    let fallbackHls: Hls | null = null;
    let cancelled = false;
    let fallbackStarted = false;
    let activeSessionId: string | null = null;
    setError(''); setQualities([]); setQuality(-1); setAudioTracks([]); setAudioTrack(-1); setSkipTarget(null); setP2pStats(null); setServerDecode(false); setNativePlayback(false);

    if (!torrentInput && stream.url && !state?.offline && !forceWebPlayback) {
      const native = getAndroidNativeBridge();
      if (native) {
        const launch = launchAndroidNativePlayer({ url: stream.url, title: state?.mediaTitle ?? stream.name ?? stream.title ?? 'Nuvio', engine: 'auto' });
        if (launch.ok) {
          setNativePlayback(true);
          const onNativeClosed = () => {
            setNativePlayback(false);
            setError('O player nativo foi fechado.');
          };
          const onNativeFailed = () => {
            setNativePlayback(false);
            setForceWebPlayback(true);
            setError('Os engines nativos falharam. Tentando o player Web e, se necessário, FFmpeg no servidor…');
          };
          window.addEventListener('nuvio-native-player-closed', onNativeClosed);
          window.addEventListener('nuvio-native-player-failed', onNativeFailed);
          return () => {
            window.removeEventListener('nuvio-native-player-closed', onNativeClosed);
            window.removeEventListener('nuvio-native-player-failed', onNativeFailed);
            native.bridge.stopPlayback();
          };
        }
        setError(launch.error ?? 'Falha ao iniciar os engines nativos; tentando o player do navegador.');
      }
    }

    if (torrentInput) {
      const controller = new AbortController();
      void streamTorrentToVideo(torrentInput, video, stream.fileIdx, setP2pStats, controller.signal)
        .catch((reason: unknown) => {
          if (controller.signal.aborted) return;
          setError(reason instanceof Error ? reason.message : 'Não foi possível iniciar a conexão P2P.');
        });
      return () => { controller.abort(); };
    }

    let parsed: URL;
    try { parsed = new URL(stream.url!); } catch { setError('A URL do stream é inválida.'); return; }
    const offlineBlob = Boolean(state?.offline && parsed.protocol === 'blob:');
    if (parsed.protocol !== 'https:' && !offlineBlob) { setError('Por segurança, este site HTTPS só reproduz fontes HTTPS.'); return; }
    const isHls = stream.mimeType?.toLowerCase().includes('mpegurl') || parsed.pathname.toLowerCase().endsWith('.m3u8');

    const startServerFallback = async () => {
      if (fallbackStarted || isHls || offlineBlob || !stream.url) return;
      fallbackStarted = true;
      setError('O navegador não conseguiu decodificar esta fonte. Iniciando conversão segura no servidor…');
      try {
        const session = await api.startTranscode(stream.url);
        if (cancelled) { void api.stopTranscode(session.sessionId).catch(() => undefined); return; }
        activeSessionId = session.sessionId;
        setServerDecode(true);
        setError('');
        if (Hls.isSupported()) {
          fallbackHls = new Hls({ enableWorker: true, capLevelToPlayerSize: true, maxBufferLength: 20, backBufferLength: 30 });
          hlsRef.current = fallbackHls;
          fallbackHls.loadSource(session.playlistUrl);
          fallbackHls.attachMedia(video);
          fallbackHls.on(Hls.Events.ERROR, (_event, data) => {
            if (data.fatal && !cancelled) setError('A conversão no servidor foi interrompida. Tente outra fonte.');
          });
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
          video.src = session.playlistUrl;
        } else {
          setError('O navegador não consegue reproduzir o HLS gerado pelo servidor.');
        }
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : 'Não foi possível iniciar a decodificação no servidor.');
      }
    };

    const onVideoError = () => {
      const code = video.error?.code;
      // MEDIA_ERR_NETWORK / DECODE / SRC_NOT_SUPPORTED. Never send HLS manifests or torrents
      // to the direct-file transcode path; those require their own source-aware pipeline.
      if (!isHls && code !== undefined && [2, 3, 4].includes(code)) void startServerFallback();
    };
    video.addEventListener('error', onVideoError);

    if (isHls && Hls.isSupported()) {
      hls = new Hls({ enableWorker: true, capLevelToPlayerSize: true, maxBufferLength: 30 });
      hlsRef.current = hls;
      hls.loadSource(stream.url!); hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, (_event, data) => {
        setQualities(data.levels.map((level, index) => ({ value: index, label: level.height ? `${level.height}p` : `${Math.round(level.bitrate / 1000)} kbps` })));
        setAudioTracks(hls?.audioTracks.map((track,index)=>({value:index,label:[track.name,track.lang].filter(Boolean).join(' · ')||`Áudio ${index+1}`}))??[]);
      });
      hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, () => { setAudioTracks(hls?.audioTracks.map((track,index)=>({value:index,label:[track.name,track.lang].filter(Boolean).join(' · ')||`Áudio ${index+1}`}))??[]); });
      hls.on(Hls.Events.ERROR, (_event, data) => { if (data.fatal) setError('Falha ao carregar o HLS. Verifique CORS, formato e disponibilidade da fonte.'); });
    } else if (!isHls || video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = stream.url!;
    } else {
      setError('Este navegador não oferece suporte ao formato HLS usado por esta fonte.');
    }
    return () => {
      cancelled = true;
      video.removeEventListener('error', onVideoError);
      hls?.destroy(); fallbackHls?.destroy(); hlsRef.current = null;
      video.pause(); video.removeAttribute('src'); video.load();
      if (activeSessionId) {
        void api.stopTranscode(activeSessionId).catch(() => undefined);
      }
    };
  }, [stream?.url, stream?.mimeType, stream?.infoHash, stream?.fileIdx, torrentInput, forceWebPlayback, state?.offline]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches('input, textarea, select, [contenteditable="true"]')) return;
      const video = videoRef.current;
      if (!video) return;
      if (event.code === 'Space') { event.preventDefault(); if (video.paused) void video.play().catch(() => undefined); else video.pause(); }
      if (event.key === 'ArrowLeft') video.currentTime = Math.max(0, video.currentTime - 10);
      if (event.key === 'ArrowRight') video.currentTime = Math.min(video.duration || Infinity, video.currentTime + 10);
      if (event.key === 'ArrowUp') { event.preventDefault(); video.volume = Math.min(1, video.volume + 0.05); }
      if (event.key === 'ArrowDown') { event.preventDefault(); video.volume = Math.max(0, video.volume - 0.05); }
      if (event.key.toLowerCase() === 'f' && video.requestFullscreen) void video.requestFullscreen().catch(() => undefined);
      if (event.key === 'Escape') navigate(-1);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [navigate]);

  useEffect(() => {
    const video = videoRef.current;
    const mediaKey = state?.mediaKey;
    if (!video || !mediaKey || settings.privateViewing) return;
    const storageKey = `nuvio-web:progress:${activeProfileId}:${mediaKey}`;
    const restore = () => {
      try {
        const saved = JSON.parse(localStorage.getItem(storageKey) ?? 'null') as { currentTime?: number; duration?: number } | null;
        if (saved?.currentTime && saved.duration && saved.currentTime < saved.duration - 40) video.currentTime = saved.currentTime;
      } catch { /* Saved progress is optional. */ }
    };
    const save = () => {
      if (!Number.isFinite(video.duration) || video.duration <= 0 || video.currentTime < 5) return;
      try { localStorage.setItem(storageKey, JSON.stringify({ currentTime: video.currentTime, duration: video.duration, updatedAt: Date.now() })); }
      catch { /* Storage may be disabled or full. */ }
    };
    video.addEventListener('loadedmetadata', restore);
    video.addEventListener('timeupdate', save);
    return () => { video.removeEventListener('loadedmetadata', restore); video.removeEventListener('timeupdate', save); };
  }, [state?.mediaKey, stream?.url, torrentInput, settings.privateViewing, activeProfileId]);


  useEffect(() => {
    const unsubscribe = subscribeParty((event) => {
      if (event.type !== 'playback') return;
      const video = videoRef.current;
      if (!video) return;
      remoteSyncRef.current = true;
      if (event.action === 'seek' && Number.isFinite(Number(event.currentTime))) video.currentTime = Math.max(0, Number(event.currentTime));
      if (event.action === 'play') { if (Number.isFinite(Number(event.currentTime))) video.currentTime = Math.max(0, Number(event.currentTime)); void video.play().catch(() => setError('O navegador bloqueou o play sincronizado da Watch Party.')); }
      if (event.action === 'pause') { if (Number.isFinite(Number(event.currentTime))) video.currentTime = Math.max(0, Number(event.currentTime)); video.pause(); }
      window.setTimeout(() => { remoteSyncRef.current = false; }, 350);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    let active = true;
    const created: Array<() => void> = [];
    if (settings.subtitleLanguage === 'off') { setSubtitleSources([]); setSelectedSubtitle(-1); return () => undefined; }
    const candidates = (stream?.subtitles ?? []).filter((subtitle) => subtitle.url && /^https:\/\//i.test(subtitle.url));
    Promise.all(candidates.map(async (subtitle) => {
      const resolved = await resolveSubtitleUrl(subtitle.url!, subtitle.label ?? subtitle.lang ?? 'Legenda', subtitleOffset, subtitle.mimeType);
      created.push(resolved.revoke);
      return { src: resolved.src, lang: subtitle.lang ?? 'und', label: subtitle.label ?? subtitle.lang ?? 'Legenda' };
    })).then((sources) => {
      if (!active) return;
      setSubtitleSources(sources);
      const preferred = settings.subtitleLanguage.toLowerCase();
      const match = sources.findIndex(source => source.lang.toLowerCase().includes(preferred) || (preferred === 'pt-br' && source.lang.toLowerCase().startsWith('pt')));
      setSelectedSubtitle(match >= 0 ? match : (sources.length ? 0 : -1));
    }).catch(() => { if (active) { setSubtitleSources([]); setSelectedSubtitle(-1); } });
    return () => { active = false; created.forEach(revoke => revoke()); };
  }, [stream?.subtitles, subtitleOffset, settings.subtitleLanguage]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const applyTrack = () => {
      Array.from(video.textTracks).forEach((track, index) => { track.mode = index === selectedSubtitle ? 'showing' : 'disabled'; });
    };
    video.addEventListener('loadedmetadata', applyTrack);
    applyTrack();
    return () => video.removeEventListener('loadedmetadata', applyTrack);
  }, [selectedSubtitle, subtitleSources]);

  function changeQuality(value: number) {
    setQuality(value);
    if (hlsRef.current) hlsRef.current.currentLevel = value;
  }

  function changeAudioTrack(value:number){setAudioTrack(value);if(hlsRef.current)hlsRef.current.audioTrack=value;}

  function changeSpeed(value: number) {
    setSpeed(value);
    if (videoRef.current) videoRef.current.playbackRate = value;
  }

  async function togglePictureInPicture() {
    const video = videoRef.current;
    if (!video || !('pictureInPictureEnabled' in document) || !document.pictureInPictureEnabled) return;
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else await video.requestPictureInPicture();
    } catch { setError('O navegador não permitiu ativar Picture-in-Picture.'); }
  }

  async function reportTrakt(action: 'start'|'pause'|'stop') {
    if (settings.privateViewing || !state?.tracking || (action === lastScrobble.current.action && Date.now()-lastScrobble.current.at < 8_000)) return;
    let token = '';
    try {
      const stored = JSON.parse(sessionStorage.getItem(`nuvio-session:${activeProfileId}:trakt`) ?? 'null') as { accessToken?: string; refreshToken?: string; expiresAt?: number } | null;
      token = stored?.accessToken ?? '';
      if (stored?.refreshToken && stored.expiresAt && stored.expiresAt < Date.now() + 60_000) {
        const refreshed = await api.traktRefresh(stored.refreshToken);
        token = refreshed.accessToken;
        sessionStorage.setItem(`nuvio-session:${activeProfileId}:trakt`, JSON.stringify({ accessToken: refreshed.accessToken, refreshToken: refreshed.refreshToken, expiresAt: Date.now() + Math.max(0, refreshed.expiresIn - 60) * 1000 }));
      }
    } catch { /* No session token or refresh failed; tracking is optional. */ }
    const video = videoRef.current;
    if (!token || !video || !Number.isFinite(video.duration) || video.duration <= 0) return;
    const progress = action === 'stop' ? 100 : Math.max(0, Math.min(100, video.currentTime / video.duration * 100));
    lastScrobble.current = { action, at: Date.now() };
    try { await sendTraktScrobble(token, { action, progress, ...state.tracking }); } catch { /* Tracking must never interrupt playback. */ }
  }

  async function reportWeTrakr(action: 'start'|'pause'|'stop') {
    if (settings.privateViewing || !state?.mediaItem || (action === lastWeTrakrScrobble.current.action && Date.now()-lastWeTrakrScrobble.current.at < 8_000)) return;
    let token = '';
    try {
      token = JSON.parse(sessionStorage.getItem(`nuvio-session:${activeProfileId}:wetrakr`) ?? '""') as string;
      const refreshToken = JSON.parse(sessionStorage.getItem(`nuvio-session:${activeProfileId}:wetrakr-refresh`) ?? '""') as string;
      const expiry = Number(JSON.parse(sessionStorage.getItem(`nuvio-session:${activeProfileId}:wetrakr-expiry`) ?? '0'));
      if (token && refreshToken && expiry > 0 && expiry < Date.now() + 60_000) {
        const refreshed = await api.wetrakrRefresh(refreshToken);
        token = refreshed.accessToken;
        sessionStorage.setItem(`nuvio-session:${activeProfileId}:wetrakr`, JSON.stringify(token));
        sessionStorage.setItem(`nuvio-session:${activeProfileId}:wetrakr-refresh`, JSON.stringify(refreshed.refreshToken));
        sessionStorage.setItem(`nuvio-session:${activeProfileId}:wetrakr-expiry`, JSON.stringify(Date.now() + Math.max(0, refreshed.expiresIn - 60) * 1000));
      }
    } catch { /* No session token or refresh failed; tracking is optional. */ }
    const video = videoRef.current;
    const item = state.mediaItem;
    if (!token || !video || !Number.isFinite(video.duration) || video.duration <= 0) return;
    const isMovie = item.media_type === 'movie';
    const trackingEpisode = state.tracking?.episode as Record<string, unknown> | undefined;
    const season = Number(trackingEpisode?.season ?? state.nextEpisode?.season);
    const episode = Number(trackingEpisode?.number ?? trackingEpisode?.episode ?? state.nextEpisode?.episode);
    const progress = action === 'stop' ? 100 : Math.max(0, Math.min(100, video.currentTime / video.duration * 100));
    const external = item.external_ids ?? {};
    const ids = { tmdb: item.id, ...(external.imdb_id ? { imdb: external.imdb_id } : {}), ...(external.tvdb_id ? { tvdb: external.tvdb_id } : {}) };
    lastWeTrakrScrobble.current = { action, at: Date.now() };
    try {
      await api.wetrakrScrobble(token, {
        action, type: isMovie ? 'movie' : 'show', title: item.title ?? item.name ?? state.mediaTitle ?? 'Unknown title',
        ...(Number((item.release_date ?? item.first_air_date ?? '').slice(0, 4)) ? { year: Number((item.release_date ?? item.first_air_date ?? '').slice(0, 4)) } : {}),
        ids, ...(!isMovie && Number.isInteger(season) && Number.isInteger(episode) ? { season, episode } : {}), progress,
      });
    } catch { /* External tracking must never interrupt playback. */ }
  }

  async function savePublicMetaDbResume(video: HTMLVideoElement) {
    if (settings.privateViewing || !state?.mediaItem || !Number.isFinite(video.duration) || video.duration <= 0 || video.currentTime < 5 || Date.now() - lastPublicMetaDbSave.current < 45_000) return;
    let key = '';
    try { key = JSON.parse(sessionStorage.getItem(`nuvio-session:${activeProfileId}:publicmetadb`) ?? '""') as string; } catch { /* No session key. */ }
    if (!key) return;
    const item = state.mediaItem;
    const isMovie = item.media_type === 'movie';
    const trackingEpisode = state.tracking?.episode as Record<string, unknown> | undefined;
    const season = Number(trackingEpisode?.season ?? state.nextEpisode?.season);
    const episode = Number(trackingEpisode?.number ?? trackingEpisode?.episode ?? state.nextEpisode?.episode);
    lastPublicMetaDbSave.current = Date.now();
    try {
      await api.publicMetaDbSaveResume(key, {
        tmdb_id: item.id, media_type: isMovie ? 'movie' : 'tv',
        position_ms: Math.round(video.currentTime * 1000), runtime_ms: Math.round(video.duration * 1000),
        ...(!isMovie && Number.isInteger(season) && Number.isInteger(episode) ? { season, episode } : {}),
      });
    } catch { /* Tracking sync is best-effort and never blocks playback. */ }
  }

  async function markPublicMetaDbWatched() {
    if (settings.privateViewing || !state?.mediaItem || publicMetaDbCompleted.current) return;
    let key = '';
    try { key = JSON.parse(sessionStorage.getItem(`nuvio-session:${activeProfileId}:publicmetadb`) ?? '""') as string; } catch { /* No session key. */ }
    if (!key) return;
    const item = state.mediaItem;
    const isMovie = item.media_type === 'movie';
    const trackingEpisode = state.tracking?.episode as Record<string, unknown> | undefined;
    const season = Number(trackingEpisode?.season ?? state.nextEpisode?.season);
    const episode = Number(trackingEpisode?.number ?? trackingEpisode?.episode ?? state.nextEpisode?.episode);
    publicMetaDbCompleted.current = true;
    try {
      await api.publicMetaDbMarkWatched(key, {
        tmdb_id: item.id, media_type: isMovie ? 'movie' : 'tv', watched_at: new Date().toISOString(),
        ...(!isMovie && Number.isInteger(season) && Number.isInteger(episode) ? { season, episode } : {}),
      });
    } catch { publicMetaDbCompleted.current = false; }
  }

  function persistProgress(video: HTMLVideoElement) {
    if (settings.privateViewing || !state?.mediaKey || !state.mediaItem) return;
    void savePublicMetaDbResume(video);
    if (Date.now() - lastProgressSave.current < 8_000) return;
    if (!Number.isFinite(video.duration) || video.duration <= 0 || video.currentTime < 5) return;
    lastProgressSave.current = Date.now();
    void saveWatchProgress({ mediaKey: state.mediaKey, profileId: activeProfileId, item: state.mediaItem, position: video.currentTime, duration: video.duration });
  }

  async function playNextEpisode() {
    const next = state?.nextEpisode;
    if (!next || !settings.autoNextEpisode || settings.privateViewing) return;
    setNextBusy(true);
    const ids = next.imdbId ? [`${next.imdbId}:${next.season}:${next.episode}`, `tmdb:${next.id}:${next.season}:${next.episode}`] : [`tmdb:${next.id}:${next.season}:${next.episode}`];
    const jobs = next.addons.filter(addon => addon.enabled !== false).flatMap(addon => ids.map(async mediaId => {
      const result = await api.addonResource({ manifestUrl: addon.manifestUrl, resource: 'stream', type: 'series', id: mediaId });
      return (result.data.streams ?? []).map(candidate => ({ ...candidate, addonName: result.addon.name }));
    }));
    const results = await Promise.allSettled(jobs);
    const streams = results.flatMap(result => result.status === 'fulfilled' ? result.value : []);
    const candidate = streams.find(item => !item.behaviorHints?.notWebReady && (item.url?.startsWith('https://') || item.url?.startsWith('magnet:') || item.infoHash));
    setNextBusy(false);
    if (!candidate) { setError('O próximo episódio não possui uma fonte compatível no navegador. Volte aos detalhes para escolher manualmente.'); return; }
    const mediaItem: MediaItem = { id: next.id, media_type: 'tv', title: state.mediaTitle, name: state.mediaTitle };
    const following = next.episodeCount && next.episode < next.episodeCount ? { ...next, episode: next.episode + 1, title: `Episódio ${next.episode + 1}` } : undefined;
    navigate('/watch', { replace: true, state: { stream: candidate, mediaTitle: `${state.mediaTitle ?? 'Série'} · T${next.season} E${next.episode} · ${next.title}`, mediaKey: `tv:${next.id}:${next.season}:${next.episode}`, mediaItem, tracking: { show: { ids: { tmdb: next.id, ...(next.imdbId ? { imdb: next.imdbId } : {}) } }, episode: { season: next.season, number: next.episode } }, nextEpisode: following } });
  }

  if (!stream) return <div className="player-unavailable"><MonitorPlay size={34} /><h2>Nenhuma reprodução selecionada</h2><p>Volte aos detalhes de um título ou abra a página P2P para selecionar uma fonte autorizada.</p><button className="button-primary" onClick={() => navigate('/')}>Ir para o início</button></div>;
  const subtitles = subtitleSources;

  return (
    <div className={`player-page player-${edition}`} style={{ '--subtitle-scale': settings.subtitleSize ?? 1, '--subtitle-color': settings.subtitleColor ?? '#ffffff', '--subtitle-font': settings.subtitleFont === 'custom' && settings.subtitleCustomFontData ? 'NuvioCustomSubtitle' : settings.subtitleFont === 'arial' ? 'Arial, sans-serif' : settings.subtitleFont === 'serif' ? 'serif' : settings.subtitleFont === 'monospace' ? 'monospace' : 'system-ui, sans-serif' } as CSSProperties}>
      {settings.subtitleFont === 'custom' && settings.subtitleCustomFontData && <style>{`@font-face{font-family:'NuvioCustomSubtitle';src:url('${settings.subtitleCustomFontData}') format('truetype');font-display:swap;}`}</style>}
      <header className="player-topbar"><button className="back-link" onClick={() => navigate(-1)}><ArrowLeft size={16} /> Voltar</button><div><b>{state?.mediaTitle ?? 'Reprodutor Nuvio'}</b><span>{nativePlayback ? 'Android nativo · ExoPlayer / libmpv' : serverDecode ? 'FFmpeg · decodificação no servidor' : isP2P ? 'WebTorrent · WebRTC P2P' : stream.addonName ?? 'Fonte externa'}</span></div><button className="icon-button" onClick={() => setShowInfo((value) => !value)} aria-label="Informações"><Info size={18} /></button></header>
      <div className="video-stage">
        {nativePlayback ? (
          <div className="video-start-overlay"><MonitorPlay size={34} /><b>Player Android nativo iniciado</b><span>O host usa ExoPlayer e pode alternar para libmpv em caso de falha</span></div>
        ) : <>
          <video ref={videoRef} controls playsInline autoPlay onPlay={(event) => { setIsPlaying(true); if (settings.analyticsOptIn && !playStartTracked.current) { playStartTracked.current = true; trackEvent(isP2P ? 'p2p_started' : 'player_started', edition, { route: '/watch', mediaType: state?.mediaItem?.type === 'movie' ? 'movie' : state?.mediaItem?.type === 'tv' ? 'tv' : 'other', provider: stream.addonName ? stream.addonName.toLowerCase().replace(/[^a-z0-9_-]/g, '-').slice(0, 32) : (isP2P ? 'webtorrent' : 'direct') }); } void reportTrakt('start'); void reportWeTrakr('start'); if (!remoteSyncRef.current) sendPartyMessage({ type: 'playback', action: 'play', currentTime: event.currentTarget.currentTime, mediaKey: state?.mediaKey }); }} onPause={(event) => { setIsPlaying(false); void reportTrakt('pause'); void reportWeTrakr('pause'); persistProgress(event.currentTarget); if (!remoteSyncRef.current) sendPartyMessage({ type: 'playback', action: 'pause', currentTime: event.currentTarget.currentTime, mediaKey: state?.mediaKey }); }} onSeeked={(event) => { persistProgress(event.currentTarget); if (!remoteSyncRef.current) sendPartyMessage({ type: 'playback', action: 'seek', currentTime: event.currentTarget.currentTime, mediaKey: state?.mediaKey }); }} onTimeUpdate={(event) => { const video=event.currentTarget; persistProgress(video); const introStart=Number(stream.introStart); const introEnd=Number(stream.introEnd); const creditsStart=Number(stream.creditsStart); if(settings.showSkipButtons&&Number.isFinite(introStart)&&Number.isFinite(introEnd)&&introEnd>introStart&&video.currentTime>=introStart&&video.currentTime<introEnd){setSkipTarget(introEnd);setSkipLabel('abertura');}else if(settings.showSkipButtons&&Number.isFinite(creditsStart)&&video.currentTime>=creditsStart){setSkipTarget(video.duration);setSkipLabel('créditos');}else setSkipTarget(null); }} onEnded={() => { void reportTrakt('stop'); void reportWeTrakr('stop'); void markPublicMetaDbWatched(); void playNextEpisode(); }} onDoubleClick={() => { const video = videoRef.current; if (video?.requestFullscreen) void video.requestFullscreen(); }}>
            {subtitles.map((subtitle, index) => <track key={`${subtitle.src}-${index}`} kind="subtitles" src={subtitle.src} srcLang={subtitle.lang} label={subtitle.label} default={index === selectedSubtitle} />)}
          </video>
          {!isPlaying && !error && <div className="video-start-overlay"><button className="play-big" onClick={() => void videoRef.current?.play().catch(() => setError('O navegador bloqueou a reprodução automática. Toque novamente para iniciar.'))}><Play size={28} fill="currentColor" /></button><span>{isP2P ? (p2pStats?.state === 'ready' ? 'P2P conectado · toque para reproduzir' : 'Conectando à rede P2P…') : serverDecode ? 'Decodificando no servidor…' : 'Toque para reproduzir'}</span></div>}
        </>}
        {error && !nativePlayback && <div className="video-error"><MonitorPlay size={30} /><b>Não foi possível reproduzir</b><p>{error}</p><small>{isP2P ? 'P2P no navegador exige peers WebRTC compatíveis, tracker WebSocket e codecs suportados pelo navegador.' : 'Fontes HLS e HTTP(S) dependem de suporte do navegador, CORS e codecs compatíveis. DRM e cabeçalhos privados não são suportados neste player.'}</small></div>}
      </div>
      {skipTarget!==null&&<div className="skip-segment-overlay"><button className="button-primary" onClick={()=>{if(videoRef.current)videoRef.current.currentTime=Math.max(0,Math.min(videoRef.current.duration||skipTarget,skipTarget+(settings.skipIntroSeconds??0)));setSkipTarget(null);}}>Pular {skipLabel} <ArrowLeft size={14}/></button></div>}
      {nextBusy && <div className="notice notice-info player-next-notice">Procurando uma fonte compatível para o próximo episódio…</div>}
      {!nativePlayback && <div className="player-tools">
        <div className="player-source-info"><span className="status-dot" /> {stream.name ?? stream.title ?? 'Stream selecionado'}</div>
        {isP2P && <span className="p2p-indicator"><Network size={14} /> {p2pStats ? `${p2pStats.peers} peer(s)` : 'P2P'}</span>}
        {edition === 'enhanced' && qualities.length > 0 && <label className="quality-select"><Gauge size={15} /><select value={quality} onChange={(event) => changeQuality(Number(event.target.value))}><option value={-1}>Auto</option>{qualities.map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}</select></label>}
        <label className="quality-select"><Gauge size={15} /><select aria-label="Velocidade de reprodução" value={speed} onChange={(event) => changeSpeed(Number(event.target.value))}><option value={0.5}>0,5×</option><option value={0.75}>0,75×</option><option value={1}>1×</option><option value={1.25}>1,25×</option><option value={1.5}>1,5×</option><option value={1.75}>1,75×</option><option value={2}>2×</option></select></label>
        {audioTracks.length>0 && <label className="quality-select"><span>Áudio</span><select aria-label="Faixa de áudio" value={audioTrack} onChange={event=>changeAudioTrack(Number(event.target.value))}><option value={-1}>Padrão</option>{audioTracks.map(track=><option key={track.value} value={track.value}>{track.label}</option>)}</select></label>}
        {subtitleSources.length>0 && <label className="quality-select"><span>Legendas</span><select aria-label="Faixa de legenda" value={selectedSubtitle} onChange={event=>setSelectedSubtitle(Number(event.target.value))}><option value={-1}>Desativadas</option>{subtitleSources.map((subtitle,index)=><option key={`${subtitle.src}-${index}`} value={index}>{subtitle.label}</option>)}</select></label>}
        <label className="quality-select"><span>Legenda</span><input className="subtitle-offset-input" type="number" min={-30} max={30} step={0.5} value={subtitleOffset} onChange={event=>setSubtitleOffset(Number(event.target.value))} title="Ajuste de sincronização da legenda em segundos"/></label>
        {subtitleSources.length>0 && <div className="subtitle-ear-sync"><span>{heardAt===null?'Sincronizar por ouvido':'Agora marque quando a legenda aparecer'}</span><button className="button-secondary small-button" onClick={()=>{const video=videoRef.current;if(!video)return;setHeardAt(video.currentTime);setSubtitleSyncMessage('Marca de áudio registrada. Toque em “Legenda apareceu” quando ler a mesma fala.');}}>Ouvi a fala</button><button className="button-secondary small-button" disabled={heardAt===null} onClick={()=>{const video=videoRef.current;if(!video||heardAt===null)return;const correction=heardAt-video.currentTime;setSubtitleOffset(current=>Math.max(-30,Math.min(30,current+correction)));setHeardAt(null);setSubtitleSyncMessage(`Sincronização ajustada em ${correction.toFixed(2)} s.`);}}>Legenda apareceu</button>{subtitleSyncMessage&&<small>{subtitleSyncMessage}</small>}</div>}
        <button className="text-button" onClick={() => void togglePictureInPicture()}><PictureInPicture2 size={15} /> PiP</button>
        <button className="text-button" onClick={() => setShowInfo((value) => !value)}><Info size={15} /> Informações</button>
      </div>}
      {isP2P && p2pStats && <section className="p2p-live-stats"><div className="p2p-progress-copy"><b>{p2pStats.fileName ?? 'Encontrando arquivo de vídeo'}</b><span>{Math.round(p2pStats.progress * 100)}% · {p2pStats.peers} peer(s)</span></div><div className="p2p-progress-track"><i style={{ width: `${Math.max(0, Math.min(100, p2pStats.progress * 100))}%` }} /></div><div className="p2p-stats-grid"><span>Baixado <b>{formatP2PBytes(p2pStats.downloaded)}</b></span><span>Download <b>{formatP2PSpeed(p2pStats.downloadSpeed)}</b></span><span>Upload <b>{formatP2PSpeed(p2pStats.uploadSpeed)}</b></span><span>Arquivo <b>{formatP2PBytes(p2pStats.total)}</b></span></div></section>}
      {showInfo && <section className="player-info-panel"><b>Informações da reprodução</b><span>Addon: {stream.addonName ?? 'Não informado'}</span><span>Formato: {stream.mimeType ?? 'Detectado pelo navegador'}</span><span>Decodificação: {nativePlayback ? 'ExoPlayer / libmpv nativo' : serverDecode ? 'FFmpeg no servidor' : 'Navegador / dispositivo'}</span><span>Qualidade HLS: {quality === -1 ? 'Automática' : qualities.find((entry) => entry.value === quality)?.label ?? 'Automática'}</span><span>Velocidade: {speed}×</span>{audioTracks.length>0&&<span>Faixa de áudio: {audioTracks.find(track=>track.value===audioTrack)?.label??'Padrão'}</span>}<span>Sincronização de legenda: {subtitleOffset.toFixed(1)}s</span><span>Modo privado: {settings.privateViewing ? 'Ativo (progresso não salvo)' : 'Desativado'}</span>{isP2P && p2pStats && <span>Rede P2P: {p2pStats.peers} peer(s), progresso {Math.round(p2pStats.progress * 100)}%</span>}<span>Teclas: Espaço reproduz/pausa · ←/→ avança 10s · ↑/↓ volume · F tela cheia · Esc voltar</span></section>}
      <div className="player-footer"><span><Volume2 size={14} /> {nativePlayback ? 'Motor Android nativo · ExoPlayer / libmpv' : isP2P ? 'P2P direto entre peers WebRTC' : serverDecode ? 'HLS decodificado pelo FFmpeg no servidor' : 'Reprodução local no navegador'}</span><span><Maximize size={14} /> {nativePlayback ? 'Controles e tela cheia no player Android' : 'Tela cheia disponível pelos controles do vídeo'}</span><span><Pause size={14} /> {nativePlayback ? 'Feche o player Android para voltar à biblioteca' : isP2P ? 'Fechar a página encerra a sessão P2P' : 'A reprodução depende do codec e do navegador'}</span></div>
    </div>
  );
}
