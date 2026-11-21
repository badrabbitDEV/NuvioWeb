import { useMemo, useState } from 'react';
import { Search as SearchIcon, SearchX } from 'lucide-react';
import MediaCard from '../components/MediaCard';
import EmptyState from '../components/EmptyState';
import { api, ApiClientError } from '../lib/api';
import { useApp } from '../lib/context';
import type { MediaItem } from '../types';
import { useStoredState } from '../lib/storage';
import { trackEvent } from '../lib/analytics';

export default function Search() {
  const { settings, activeProfileId, edition } = useApp();
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<MediaItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [history,setHistory]=useStoredState<string[]>(`nuvio-web:${activeProfileId}:search-history`,[]);
  const [filter,setFilter]=useState<'all'|'movie'|'tv'>('all');
  const filteredItems=useMemo(()=>items.filter(item=>filter==='all'||item.media_type===filter),[items,filter]);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!query.trim()) return;
    setBusy(true); setError('');
    if (settings.analyticsOptIn) trackEvent('search_used', edition, { route: '/search' });
    try {
      const result = await api.search(query.trim(), settings.preferredLanguage);
      setItems((result.results ?? []).filter((item) => item.media_type === 'movie' || item.media_type === 'tv'));
      setHistory(current=>[query.trim(),...current.filter(value=>value.toLowerCase()!==query.trim().toLowerCase())].slice(0,12));
    } catch (reason) {
      setError(reason instanceof ApiClientError ? reason.message : 'Falha ao pesquisar.'); setItems([]);
    } finally { setBusy(false); }
  }
  return (
    <div className="page-stack">
      <section className="page-intro"><span className="eyebrow">DESCOBERTA</span><h2>O que vamos assistir?</h2><p>Pesquise títulos usando os metadados do TMDB.</p></section>
      <form className="search-bar" onSubmit={submit}><SearchIcon size={20} /><input autoFocus placeholder="Buscar filmes e séries..." value={query} onChange={(event) => setQuery(event.target.value)} /><button className="button-primary" disabled={busy || !query.trim()}>{busy ? 'Buscando…' : 'Buscar'}</button></form>
      {error && <div className="inline-message error">{error}</div>}
      {!items.length&&history.length>0&&<div className="search-history"><span>Pesquisas recentes</span>{history.map(value=><button key={value} onClick={()=>setQuery(value)}>{value}</button>)}<button className="text-button" onClick={()=>setHistory([])}>Limpar histórico</button></div>}
      {items.length ? <><div className="section-heading"><div><span className="eyebrow">RESULTADOS</span><h2>{filteredItems.length} encontrados</h2></div><select className="compact-select" value={filter} onChange={e=>setFilter(e.target.value as typeof filter)}><option value="all">Filmes e séries</option><option value="movie">Filmes</option><option value="tv">Séries</option></select></div><div className="media-grid">{filteredItems.map((item) => <MediaCard key={`${item.media_type}-${item.id}`} item={item} />)}</div></> : !busy && query && !error ? <EmptyState icon={<SearchX size={22} />} title="Nada encontrado" message="Tente pesquisar com outro título ou grafia." /> : !query ? <EmptyState icon={<SearchIcon size={22} />} title="Pesquise seu próximo título" message="Os resultados aparecerão aqui depois da pesquisa." /> : null}
    </div>
  );
}
