import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Bookmark, Check, Play, RefreshCw, Search, ShieldCheck, Star } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { useApp } from '../lib/context';
import { api, ApiClientError } from '../lib/api';
import type { MediaItem, Stream } from '../types';
import { rankStreams } from '../lib/stream-ranking';

type AniListMedia = {
  id: number; idMal?: number; type?: string; format?: string; episodes?: number; seasonYear?: number;
  title?: { romaji?: string; english?: string; native?: string }; description?: string;
  averageScore?: number; genres?: string[]; coverImage?: { large?: string; extraLarge?: string };
  bannerImage?: string; studios?: { nodes?: Array<{ name: string }> };
};

const ANILIST_QUERY = `query ($id:Int) { Media(id:$id,type:ANIME) { id idMal type format episodes seasonYear title { romaji english native } description averageScore genres coverImage { large extraLarge } bannerImage studios { nodes { name } } } }`;

export default function AniListDetails() {
  const { id: rawId = '' } = useParams();
  const id = Number(rawId);
  const navigate = useNavigate();
  const { addons, edition, library, setLibrary, settings } = useApp();
  const [media, setMedia] = useState<AniListMedia | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [streams, setStreams] = useState<Stream[]>([]);
  const [query, setQuery] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    fetch('https://graphql.anilist.co', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: ANILIST_QUERY, variables: { id } }),
      signal: AbortSignal.timeout(18_000),
    }).then(async response => {
      const body = await response.json();
      if (!response.ok || body.errors || !body.data?.Media) throw new Error('Anime não encontrado na AniList.');
      return body.data.Media as AniListMedia;
    }).then(value => { if (active) setMedia(value); })
      .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : 'Falha ao consultar AniList.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id]);

  const title = media?.title?.english || media?.title?.romaji || media?.title?.native || 'Anime';
  const saved = useMemo(() => library.some(item => item.sourceProvider === 'anilist' && Number(item.sourceId ?? item.id) === id), [library, id]);
  const mappedItem: MediaItem | null = media ? {
    id: media.id, media_type: 'tv', title, name: title,
    overview: (media.description ?? '').replace(/<[^>]*>/g, ' '),
    vote_average: media.averageScore ? media.averageScore / 10 : undefined,
    first_air_date: media.seasonYear ? `${media.seasonYear}-01-01` : undefined,
    sourceProvider: 'anilist', sourceId: media.id,
    sourcePosterUrl: media.coverImage?.extraLarge ?? media.coverImage?.large,
    sourceBackdropUrl: media.bannerImage,
    external_ids: { anilist_id: media.id, ...(media.idMal ? { mal_id: media.idMal } : {}) },
  } : null;

  async function findStreams() {
    if (!media) return;
    if (!addons.length) { setError('Instale addons que aceitem IDs AniList/MAL para encontrar fontes.'); return; }
    setBusy(true); setError(''); setStreams([]);
    const mediaType = media.format === 'MOVIE' ? 'movie' : 'series';
    const ids = [
      ...(media.idMal ? [`mal:${media.idMal}`, ...(mediaType === 'series' ? [`mal:${media.idMal}:1:1`] : [])] : []),
      `anilist:${media.id}`,
      ...(mediaType === 'series' ? [`anilist:${media.id}:1:1`] : []),
    ];
    const jobs = addons.filter(addon => addon.enabled !== false).flatMap(addon => ids.map(async streamId => {
      const response = await api.addonResource({ manifestUrl: addon.manifestUrl, resource: 'stream', type: mediaType, id: streamId });
      return (response.data.streams ?? []).map(stream => ({ ...stream, addonName: response.addon.name }));
    }));
    const results = await Promise.allSettled(jobs);
    const found = results.flatMap(result => result.status === 'fulfilled' ? result.value : []);
    const unique = found.filter((item, index) => found.findIndex(candidate => (candidate.url && candidate.url === item.url) || (candidate.infoHash && candidate.infoHash === item.infoHash)) === index);
    const ordered = edition === 'enhanced' ? rankStreams(unique, settings) : unique;
    setStreams(ordered);
    if (!ordered.length) setError('Nenhum addon retornou fontes para os IDs AniList/MAL deste anime.');
    setBusy(false);
  }

  async function play(stream: Stream) {
    let subtitles = stream.subtitles ?? [];
    const addon = addons.find(entry => entry.manifest.name === stream.addonName);
    const sourceId = media?.idMal ? `mal:${media.idMal}` : `anilist:${id}`;
    if (addon) {
      try {
        const response = await api.addonResource({ manifestUrl: addon.manifestUrl, resource: 'subtitles', type: media?.format === 'MOVIE' ? 'movie' : 'series', id: sourceId });
        subtitles = [...subtitles, ...(response.data.subtitles ?? [])];
      } catch { /* A legenda é opcional. */ }
    }
    navigate('/watch', { state: { stream: { ...stream, subtitles }, mediaTitle: title, mediaKey: `anilist:${id}`, mediaItem: mappedItem } });
  }

  if (loading) return <div className="loading-screen"><RefreshCw className="spin" size={20}/> Carregando anime…</div>;
  if (!media) return <div className="page-stack"><button className="back-link" onClick={() => navigate(-1)}><ArrowLeft size={15}/> Voltar</button><div className="notice notice-warning">{error || 'Anime não encontrado.'}</div></div>;

  const backdrop = media.bannerImage;
  return <div className="detail-page">
    <button className="back-link" onClick={() => navigate(-1)}><ArrowLeft size={15}/> Voltar</button>
    <section className="detail-hero" style={backdrop ? { backgroundImage: `linear-gradient(90deg,rgba(8,10,15,.96),rgba(8,10,15,.72)),url(${backdrop})` } : undefined}>
      <div className="detail-hero-content"><div className="detail-poster">{mappedItem?.sourcePosterUrl && <img src={mappedItem.sourcePosterUrl} alt={`Capa de ${title}`}/>}</div>
        <div className="detail-copy"><span className="eyebrow">ANILIST · {media.format ?? 'ANIME'} {media.seasonYear ? `· ${media.seasonYear}` : ''}</span><h2>{title}</h2>
          <div className="detail-facts">{media.averageScore ? <span><Star size={14} fill="currentColor"/> {(media.averageScore / 10).toFixed(1)}</span> : null}{media.episodes ? <span>{media.episodes} episódios</span> : null}{media.genres?.slice(0, 4).map(genre => <span key={genre}>{genre}</span>)}</div>
          <p>{mappedItem?.overview || 'Sem sinopse.'}</p>
          <div className="detail-actions"><button className="button-primary" onClick={() => void findStreams()} disabled={busy}><Search size={15}/> {busy ? 'Consultando addons…' : 'Encontrar fontes'}</button><button className={`button-secondary ${saved ? 'saved-button' : ''}`} onClick={() => mappedItem && setLibrary(current => saved ? current.filter(item => !(item.sourceProvider === 'anilist' && Number(item.sourceId ?? item.id) === id)) : [mappedItem, ...current])}>{saved ? <Check size={15}/> : <Bookmark size={15}/>} {saved ? 'Salvo' : 'Salvar na biblioteca'}</button></div>
        </div>
      </div>
    </section>
    {error && <div className="notice notice-info"><ShieldCheck size={17}/><span>{error}</span></div>}
    {streams.length > 0 && <section className="section-block"><div className="section-heading"><div><span className="eyebrow">ADDONS</span><h2>Fontes disponíveis</h2></div><span className="count-bubble">{streams.length}</span></div><input className="wide-input" placeholder="Filtrar por codec, qualidade ou addon" value={query} onChange={event => setQuery(event.target.value)}/><div className="stream-list">{streams.filter(stream => `${stream.name ?? ''} ${stream.title ?? ''} ${stream.description ?? ''} ${stream.addonName ?? ''}`.toLowerCase().includes(query.toLowerCase())).map((stream,index) => <article className="stream-card" key={`${stream.addonName}-${stream.url ?? stream.infoHash}-${index}`}><div className="stream-main"><b>{stream.name ?? stream.title ?? `Fonte ${index + 1}`}</b><span>{stream.description ?? stream.addonName}</span><small>{stream.addonName}</small></div><button className="button-primary small-button" onClick={() => void play(stream)} disabled={Boolean(stream.behaviorHints?.notWebReady) || !(stream.url?.startsWith('https://') || stream.url?.startsWith('magnet:') || stream.infoHash)}><Play size={14}/> {stream.infoHash || stream.url?.startsWith('magnet:') ? 'Abrir P2P' : 'Reproduzir'}</button></article>)}</div></section>}
    <div className="notice notice-info"><ShieldCheck size={17}/><div><b>Integração AniList</b><span>Os metadados são obtidos diretamente do AniList. A reprodução depende de addons que reconheçam IDs AniList ou MyAnimeList.</span></div></div>
  </div>;
}
