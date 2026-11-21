import { BookmarkPlus, Play } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../lib/context';
import { tmdbImage } from '../lib/api';
import { readStored } from '../lib/storage';
import type { MediaItem } from '../types';

export default function MediaCard({ item, compact = false }: { item: MediaItem; compact?: boolean }) {
  const navigate = useNavigate();
  const { setLibrary, library, settings, activeProfileId } = useApp();
  const type = item.media_type === 'tv' ? 'tv' : 'movie';
  const title = (settings.showOriginalTitles ? item.original_title ?? item.original_name : undefined) ?? item.title ?? item.name ?? 'Sem título';
  const saved = library.some((entry) => entry.id === item.id && entry.media_type === item.media_type);
  const posterOverrides=readStored<Record<string,string>>(`nuvio-web:${activeProfileId}:poster-overrides`,{});
  const poster = posterOverrides[`${item.media_type??'movie'}:${item.id}`] ?? item.sourcePosterUrl ?? tmdbImage(item.poster_path);
  return (
    <article className={`media-card ${compact ? 'compact' : ''}`}>
      <button className="poster-button" onClick={() => navigate(item.sourceProvider === 'anilist' ? `/anilist/${item.sourceId ?? item.id}` : `/details/${type}/${item.id}`, { state: { item } })} aria-label={`Abrir ${title}`}>
        {poster ? <img src={poster} alt={`Pôster de ${title}`} loading="lazy" /> : <div className="poster-placeholder"><Play size={24} /><span>NUVIO</span></div>}
        <span className="poster-hover"><Play size={24} fill="currentColor" /></span>
        {item.vote_average ? <span className="rating-pill">★ {item.vote_average.toFixed(1)}</span> : null}
      </button>
      <div className="media-card-info">
        <button className="media-title" onClick={() => navigate(item.sourceProvider === 'anilist' ? `/anilist/${item.sourceId ?? item.id}` : `/details/${type}/${item.id}`, { state: { item } })}>{title}</button>
        <div className="media-meta"><span>{item.media_type === 'tv' ? 'Série' : 'Filme'}</span><span>{(item.release_date ?? item.first_air_date ?? '').slice(0, 4)}</span>
          <button className={`save-mini ${saved ? 'saved' : ''}`} aria-label={saved ? 'Remover da biblioteca' : 'Salvar na biblioteca'} onClick={() => setLibrary((current) => saved ? current.filter((entry) => !(entry.id === item.id && entry.media_type === item.media_type)) : [item, ...current])}><BookmarkPlus size={15} /></button>
        </div>
      </div>
    </article>
  );
}
