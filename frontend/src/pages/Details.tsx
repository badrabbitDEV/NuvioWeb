import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Bookmark, Check, Clock3, Play, RefreshCw, Search, ShieldCheck, Star, Sparkles } from 'lucide-react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { api, ApiClientError, tmdbImage } from '../lib/api';
import { useApp } from '../lib/context';
import type { MediaItem, Stream } from '../types';
import { inspectStream, rankStreams, scoreStream } from '../lib/stream-ranking';
import MediaCard from '../components/MediaCard';
import { useStoredState } from '../lib/storage';
import type { TmdbDetails } from '../lib/api';


export default function Details() {
  const { type: routeType = 'movie', id: routeId = '' } = useParams();
  const type = routeType === 'tv' ? 'tv' : 'movie';
  const id = Number(routeId);
  const location = useLocation();
  const navigate = useNavigate();
  const { addons, edition, library, setLibrary, settings, activeProfileId } = useApp();
  const [details, setDetails] = useState<TmdbDetails | null>((location.state as { item?: MediaItem } | null)?.item as TmdbDetails | null ?? null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [season, setSeason] = useState(1);
  const [episode, setEpisode] = useState(1);
  const [episodes, setEpisodes] = useState<Array<{ episode_number: number; name: string; overview?: string; air_date?: string; vote_average?: number; still_path?: string | null }>>([]);
  const [streams, setStreams] = useState<Stream[]>([]);
  const [pinnedSources, setPinnedSources] = useStoredState<string[]>(`nuvio-web:${activeProfileId}:pinned-stream-sources`, []);
  const [streamQuery, setStreamQuery] = useState('');
  const [streamResolution, setStreamResolution] = useState('all');
  const [streamCodec,setStreamCodec]=useState('all');
  const [streamAudio,setStreamAudio]=useState('all');
  const [streamHdr,setStreamHdr]=useState('all');
  const [searchingStreams, setSearchingStreams] = useState(false);
  const [streamError, setStreamError] = useState('');
  const [showStreams, setShowStreams] = useState(false);
  const [episodeQuery, setEpisodeQuery] = useState('');
  const [episodeSort, setEpisodeSort] = useState<'asc'|'desc'|'rating'|'newest'|'unwatched'>('asc');
  const [userRating, setUserRating] = useStoredState<number>(`nuvio-web:${activeProfileId}:rating:${type}:${id}`, 0);
  const [watched, setWatched] = useStoredState<boolean>(`nuvio-web:${activeProfileId}:watched:${type}:${id}`, false);
  const [posterOverrides,setPosterOverrides]=useStoredState<Record<string,string>>(`nuvio-web:${activeProfileId}:poster-overrides`,{});
  const [posterInput,setPosterInput]=useState(posterOverrides[`${type}:${id}`]??'');

  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    api.details(type, id, settings.preferredLanguage)
      .then((result) => { if (active) { setDetails(result); const firstSeason = result.seasons?.find((entry) => entry.season_number > 0)?.season_number ?? 1; setSeason(firstSeason); } })
      .catch((reason: unknown) => { if (active) setError(reason instanceof ApiClientError ? reason.message : 'Não foi possível carregar os detalhes.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [type, id, settings.preferredLanguage]);

  useEffect(() => {
    if (type !== 'tv' || !details) return;
    let active = true;
    api.season(id, season, settings.preferredLanguage).then((result) => {
      if (active) { setEpisodes(result.episodes ?? []); setEpisode(result.episodes?.[0]?.episode_number ?? 1); }
    }).catch(() => { if (active) setEpisodes([]); });
    return () => { active = false; };
  }, [type, id, season, details, settings.preferredLanguage]);

  const title = (settings.showOriginalTitles ? details?.original_title ?? details?.original_name : undefined) ?? details?.title ?? details?.name ?? 'Detalhes';
  const posterUrl=posterOverrides[`${type}:${id}`]??tmdbImage(details?.poster_path);
  const formatMoney=(value:number|undefined)=>value&&value>0?new Intl.NumberFormat('pt-BR',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(value):undefined;
  const saved = useMemo(() => library.some((item) => item.id === id && item.media_type === type), [library, id, type]);
  const imdbId = details?.external_ids?.imdb_id;
  const releaseYear = (details?.release_date ?? details?.first_air_date ?? '').slice(0, 4);
  const backdrop = tmdbImage(details?.backdrop_path, 'original');

  async function findStreams(episodeOverride = episode) {
    setSearchingStreams(true); setStreamError(''); setStreams([]); setShowStreams(true);
    if (!addons.length) { setSearchingStreams(false); setStreamError('Instale um addon compatível antes de procurar streams.'); return; }
    const streamType = type === 'tv' ? 'series' : 'movie';
    const streamId = type === 'tv'
      ? (imdbId ? `${imdbId}:${season}:${episodeOverride}` : `tmdb:${id}:${season}:${episodeOverride}`)
      : (imdbId ?? `tmdb:${id}`);
    const settled = await Promise.allSettled(addons.map((addon) => api.addonResource({ manifestUrl: addon.manifestUrl, resource: 'stream', type: streamType, id: streamId })));
    const collected: Stream[] = [];
    const errors: string[] = [];
    for (const result of settled) {
      if (result.status === 'fulfilled') {
        const returned = result.value.data.streams ?? [];
        collected.push(...returned.map((stream) => ({ ...stream, addonName: result.value.addon.name })));
      } else errors.push(result.reason instanceof Error ? result.reason.message : 'Addon indisponível');
    }
    const ranked = edition === 'enhanced' ? rankStreams(collected, settings) : collected;
    const usable = settings.hideCam ? ranked.filter(stream => !/\b(cam|telesync|hdcam|telescreener)\b/i.test(`${stream.name ?? ''} ${stream.title ?? ''} ${stream.description ?? ''}`)) : ranked;
    setStreams(usable);
    if (!usable.length) setStreamError(errors[0] ?? 'Nenhum stream compatível foi retornado. Verifique os addons instalados e os filtros.');
    setSearchingStreams(false);
    if (settings.streamAutoPlay === 'best' && usable.length) {
      const best = rankStreams(usable, settings).find(stream => !stream.behaviorHints?.notWebReady && (stream.url?.startsWith('https://') || stream.url?.startsWith('magnet:') || stream.infoHash));
      if (best) await playStream(best, episodeOverride);
    }
  }


  async function playStream(stream: Stream, episodeOverride = episode) {
    let subtitles = stream.subtitles ?? [];
    const owner = addons.find(addon => addon.manifest.name === stream.addonName);
    const streamType = type === 'tv' ? 'series' : 'movie';
    const streamId = type === 'tv' ? (imdbId ? `${imdbId}:${season}:${episodeOverride}` : `tmdb:${id}:${season}:${episodeOverride}`) : (imdbId ?? `tmdb:${id}`);
    if (owner) {
      try { const result = await api.addonResource({ manifestUrl: owner.manifestUrl, resource: 'subtitles', type: streamType, id: streamId }); subtitles = [...subtitles, ...(result.data.subtitles ?? [])]; } catch { /* Subtitles are optional for an otherwise playable stream. */ }
    }
    const currentSeason = details?.seasons?.find(item => item.season_number === season);
    const nextInSeason = type === 'tv' ? episodes.filter(entry => entry.episode_number > episodeOverride).sort((a,b)=>a.episode_number-b.episode_number)[0] : undefined;
    const nextSeason = !nextInSeason && type === 'tv' ? details?.seasons?.filter(item => item.season_number > season).sort((a,b)=>a.season_number-b.season_number)[0] : undefined;
    const nextEpisode = nextInSeason ? { type: 'tv' as const, id, season, episode: nextInSeason.episode_number, title: nextInSeason.name, episodeCount: currentSeason?.episode_count, imdbId, addons } : nextSeason ? { type: 'tv' as const, id, season: nextSeason.season_number, episode: 1, title: 'Episódio 1', episodeCount: nextSeason.episode_count, imdbId, addons } : undefined;
    const episodeMedia: MediaItem = { id, media_type: type, title: details?.title, name: details?.name, overview: details?.overview, poster_path: details?.poster_path, backdrop_path: details?.backdrop_path, release_date: details?.release_date, first_air_date: details?.first_air_date, vote_average: details?.vote_average };
    navigate('/watch', { state: { stream: { ...stream, subtitles }, mediaTitle: title, mediaKey: `${type}:${id}:${season}:${episodeOverride}`, mediaItem: episodeMedia, nextEpisode, tracking: type === 'tv' ? { show: { ids: { tmdb: id, ...(imdbId ? { imdb: imdbId } : {}) } }, episode: { season, number: episodeOverride } } : { movie: { ids: { tmdb: id, ...(imdbId ? { imdb: imdbId } : {}) } } } } });
  }

  const displayedEpisodes = episodes.filter(entry => `${entry.name} ${entry.overview ?? ''} ${entry.episode_number}`.toLowerCase().includes(episodeQuery.toLowerCase())).slice().sort((a,b)=>{
    if (episodeSort === 'desc') return b.episode_number-a.episode_number;
    if (episodeSort === 'rating') return (b.vote_average??0)-(a.vote_average??0);
    if (episodeSort === 'newest') return (b.air_date??'').localeCompare(a.air_date??'');
    return a.episode_number-b.episode_number;
  });
  const visibleStreams = streams.filter(stream => {
    const text = `${stream.name ?? ''} ${stream.title ?? ''} ${stream.description ?? ''} ${stream.addonName ?? ''}`.toLowerCase();
    const meta=inspectStream(stream);
    if (streamQuery.trim() && !text.includes(streamQuery.trim().toLowerCase())) return false;
    if (['2160','1080','720'].includes(streamResolution) && meta.resolution < Number(streamResolution)) return false;
    if (streamResolution==='web-dl'&&meta.source!=='WEB-DL') return false;
    if (streamResolution==='hdr'&&!meta.hdr) return false;
    if (streamCodec!=='all'&&meta.codec!==streamCodec) return false;
    if (streamAudio!=='all'&&!meta.audio.some(value=>value.includes(streamAudio)||(streamAudio==='pt'&&value.includes('portugu')))) return false;
    if (streamHdr==='hdr'&&!meta.hdr) return false;
    if (streamHdr==='sdr'&&meta.hdr) return false;
    return true;
  }).sort((a,b) => Number(pinnedSources.includes(b.addonName ?? ''))-Number(pinnedSources.includes(a.addonName ?? '')));
  async function playBestForDevice(){const best=rankStreams(visibleStreams,settings).find(stream=>scoreStream(stream,settings).browserReady);if(best)await playStream(best);else setStreamError('Não há fontes compatíveis com o navegador neste resultado.');}

  if (loading && !details) return <div className="loading-screen"><RefreshCw className="spin" size={22} /> Carregando detalhes…</div>;
  return (
    <div className="detail-page">
      <button className="back-link" onClick={() => navigate(-1)}><ArrowLeft size={16} /> Voltar</button>
      {error && <div className="notice notice-warning">{error}</div>}
      <section className="detail-hero" style={backdrop ? { backgroundImage: `linear-gradient(90deg, rgba(8,10,15,.98) 0%, rgba(8,10,15,.82) 48%, rgba(8,10,15,.3) 100%), url(${backdrop})` } : undefined}>
        <div className="detail-hero-content">
          <div className="detail-poster">{posterUrl && <img src={posterUrl} alt={`Pôster de ${title}`} />}</div>
          <div className="detail-copy"><span className="eyebrow">{type === 'tv' ? 'SÉRIE' : 'FILME'} {releaseYear && `· ${releaseYear}`}</span><h2>{title}</h2>
            <div className="detail-facts">{details?.vote_average ? <span><Star size={14} fill="currentColor" /> {details.vote_average.toFixed(1)}</span> : null}{details?.runtime ? <span><Clock3 size={14} /> {details.runtime} min</span> : null}{details?.genres?.slice(0, 3).map((genre) => <span key={genre.id}>{genre.name}</span>)}{formatMoney(Number(details?.budget))&&<span>Orçamento {formatMoney(Number(details?.budget))}</span>}{formatMoney(Number(details?.revenue))&&<span>Bilheteria {formatMoney(Number(details?.revenue))}</span>}</div>
            <p>{details?.overview || 'Sinopse não disponível.'}</p>
            <div className="detail-actions"><button className="button-primary" onClick={findStreams} disabled={searchingStreams}><Play size={16} fill="currentColor" /> {searchingStreams ? 'Consultando fontes' : 'Encontrar fontes'}</button><button className={`button-secondary ${saved ? 'saved-button' : ''}`} onClick={() => setLibrary((current) => saved ? current.filter((item) => !(item.id === id && item.media_type === type)) : [{ id, media_type: type, title: details?.title, name: details?.name, overview: details?.overview, poster_path: details?.poster_path, backdrop_path: details?.backdrop_path, vote_average: details?.vote_average, release_date: details?.release_date, first_air_date: details?.first_air_date }, ...current])}>{saved ? <Check size={16} /> : <Bookmark size={16} />} {saved ? 'Salvo' : 'Salvar'}</button></div>
          </div>
        </div>
      </section>

      {type === 'tv' && details?.seasons?.filter((entry) => entry.season_number > 0).length ? <section className="panel episode-browser"><div className="section-heading"><div><span className="eyebrow">EPISÓDIOS</span><h3>Temporada e episódios</h3></div><div className="episode-selects"><label>Temporada<select value={season} onChange={(event) => setSeason(Number(event.target.value))}>{details.seasons.filter((entry) => entry.season_number > 0).map((entry) => <option key={entry.id} value={entry.season_number}>{entry.name}</option>)}</select></label><label>Ordenar<select value={episodeSort} onChange={e=>setEpisodeSort(e.target.value as typeof episodeSort)}><option value="asc">Primeiro ao último</option><option value="desc">Último ao primeiro</option><option value="rating">Melhor avaliação</option><option value="newest">Mais recentes</option></select></label></div></div><input className="wide-input" placeholder="Buscar episódio por título, resumo ou número" value={episodeQuery} onChange={e=>setEpisodeQuery(e.target.value)}/><div className="episode-grid">{displayedEpisodes.map((entry)=><article className="episode-card" key={entry.episode_number}><div><b>{String(entry.episode_number).padStart(2,'0')} · {entry.name}</b><span>{entry.air_date??''}{entry.vote_average?` · ★ ${entry.vote_average.toFixed(1)}`:''}</span><p>{entry.overview??'Sem sinopse para este episódio.'}</p></div><button className="button-secondary small-button" onClick={()=>{setEpisode(entry.episode_number);setShowStreams(true);void findStreams(entry.episode_number);}}><Play size={14}/> Fontes</button></article>)}</div></section> : null}

      <section className="panel detail-user-actions"><div><span className="eyebrow">ACOMPANHAMENTO</span><h3>Sua atividade</h3><p>As avaliações e o status assistido são guardados por perfil neste navegador.</p></div><div className="rating-control"><span>Sua nota</span>{[1,2,3,4,5,6,7,8,9,10].map(value=><button className={userRating>=value?'active':''} key={value} onClick={()=>setUserRating(value)}>{value}</button>)}<button className="text-button" onClick={()=>setUserRating(0)}>Limpar</button></div><button className={`button-secondary ${watched?'saved-button':''}`} onClick={()=>setWatched(value=>!value)}><Check size={15}/>{watched?'Marcado como assistido':'Marcar como assistido'}</button></section>
      <section className="panel poster-customization"><div className="panel-heading"><div className="panel-icon"><Bookmark size={18}/></div><div><h3>Pôster personalizado</h3><p>Defina uma imagem pública HTTPS para este título neste perfil.</p></div></div><div className="input-action-row"><input className="wide-input" type="url" value={posterInput} onChange={e=>setPosterInput(e.target.value)} placeholder="https://.../poster.webp"/><button className="button-primary" onClick={()=>{const value=posterInput.trim();if(!value){setPosterOverrides(current=>{const next={...current};delete next[`${type}:${id}`];return next;});return;}try{const url=new URL(value);if(url.protocol!=='https:')throw new Error();setPosterOverrides(current=>({...current,[`${type}:${id}`]:url.toString()}));}catch{setError('O pôster precisa usar uma URL HTTPS válida.');}}}>Aplicar</button><button className="button-secondary" onClick={()=>{setPosterInput('');setPosterOverrides(current=>{const next={...current};delete next[`${type}:${id}`];return next;});}}>Restaurar</button></div></section>
      {details?.videos?.results?.some(video=>video.site==='YouTube'&&video.type==='Trailer')&&<section className="section-block"><div className="section-heading"><div><span className="eyebrow">VÍDEO</span><h2>Trailer</h2></div></div><div className="trailer-frame"><iframe src={`https://www.youtube-nocookie.com/embed/${details.videos.results.find(video=>video.site==='YouTube'&&video.type==='Trailer')?.key}`} title={`Trailer de ${title}`} loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen/></div></section>}
      {details?.credits?.cast?.length? <section className="section-block"><div className="section-heading"><div><span className="eyebrow">ELENCO</span><h2>Elenco principal</h2></div></div><div className="cast-row">{details.credits.cast.slice(0,12).map(person=><div className="cast-card" key={person.id}><div className="cast-photo">{person.profile_path&&<img src={tmdbImage(person.profile_path,'w185')} alt="" loading="lazy"/>}</div><b>{person.name}</b><span>{person.character}</span></div>)}</div></section>:null}
      {details?.recommendations?.results?.length? <section className="section-block"><div className="section-heading"><div><span className="eyebrow">RECOMENDAÇÕES</span><h2>Você também pode gostar</h2></div></div><div className="media-grid">{details.recommendations.results.filter(item=>item.media_type==='movie'||item.media_type==='tv').slice(0,8).map(item=><MediaCard key={`${item.media_type}-${item.id}`} item={item}/>)}</div></section>:null}

      {showStreams && <section className="section-block stream-section"><div className="section-heading"><div><span className="eyebrow">ADDONS INSTALADOS</span><h2>Fontes disponíveis</h2></div><button className="text-button" onClick={findStreams} disabled={searchingStreams}><RefreshCw size={14} /> Atualizar</button></div>
        {streams.length>0&&<><div className="smart-stream-toolbar"><input className="wide-input" placeholder="Filtrar por addon, qualidade, codec ou áudio" value={streamQuery} onChange={e=>setStreamQuery(e.target.value)}/><select value={streamResolution} onChange={e=>setStreamResolution(e.target.value)}><option value="all">Todas as resoluções</option><option value="2160">Mínimo 4K / 2160p</option><option value="1080">Mínimo 1080p</option><option value="720">Mínimo 720p</option><option value="web-dl">WEB-DL</option><option value="hdr">HDR</option></select><select aria-label="Codec" value={streamCodec} onChange={e=>setStreamCodec(e.target.value)}><option value="all">Todos os codecs</option><option value="h264">H.264 / AVC</option><option value="hevc">HEVC / H.265</option><option value="av1">AV1</option><option value="vp9">VP9</option></select><select aria-label="Idioma do áudio" value={streamAudio} onChange={e=>setStreamAudio(e.target.value)}><option value="all">Qualquer áudio</option><option value="pt">Português</option><option value="en">Inglês</option><option value="es">Espanhol</option><option value="ja">Japonês</option></select><select aria-label="Faixa dinâmica" value={streamHdr} onChange={e=>setStreamHdr(e.target.value)}><option value="all">HDR e SDR</option><option value="hdr">Somente HDR</option><option value="sdr">Somente SDR</option></select></div><div className="stream-best-action"><span>{visibleStreams.length} de {streams.length} fontes · ordenação {settings.streamSort}</span><button className="button-primary small-button" onClick={()=>void playBestForDevice()} disabled={!visibleStreams.length}><Sparkles size={14}/> Reproduzir melhor para este dispositivo</button></div></>}
        {searchingStreams ? <div className="loading-screen small-loading"><RefreshCw className="spin" size={20} /> Consultando addons…</div> : streams.length ? <div className="stream-list">{visibleStreams.map((stream, index) => <article className="stream-card" key={`${stream.addonName}-${stream.url}-${index}`}><div className="stream-icon"><Play size={17} /></div><div className="stream-main"><b>{stream.name ?? stream.title ?? `Fonte ${index + 1}`}</b><span>{stream.description ?? stream.addonName ?? 'Fonte externa'}</span><small>{stream.addonName}{stream.behaviorHints?.notWebReady ? ' · não pronto para web' : ''}{edition==='enhanced'?` · ${scoreStream(stream,settings).reasons.slice(0,3).join(' · ')}`:''}</small></div><div className="stream-right">{!stream.behaviorHints?.notWebReady && (stream.url?.startsWith('https://') || stream.url?.toLowerCase().startsWith('magnet:') || Boolean(stream.infoHash)) ? <button className="button-primary small-button" onClick={() => void playStream(stream)}>{stream.infoHash || stream.url?.toLowerCase().startsWith('magnet:') ? 'Abrir P2P' : 'Reproduzir'}</button> : <span className="unsupported-label">Não reproduzível na web</span>}<button className={pinnedSources.includes(stream.addonName??'')?'text-button pinned-source':'text-button'} onClick={()=>setPinnedSources(current=>current.includes(stream.addonName??'')?current.filter(value=>value!==(stream.addonName??'')):[...current,stream.addonName??''])} title="Fixar fonte no topo">{pinnedSources.includes(stream.addonName??'')?'Fixado':'Fixar'}</button></div></article>)}</div> : <div className="notice notice-info"><ShieldCheck size={18} /><div><b>Nenhuma fonte utilizável</b><span>{streamError || 'Os addons não retornaram fontes compatíveis com navegador.'} Streams HTTP(S) compatíveis e torrents com peers WebRTC podem ser reproduzidos. DRM, cabeçalhos privados e peers BitTorrent comuns sem WebRTC não são suportados.</span></div></div>}
      </section>}
    </div>
  );
}
