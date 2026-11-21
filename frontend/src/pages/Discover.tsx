import { useEffect, useState } from 'react';
import { ArrowRight, CircleAlert, Clapperboard, Plus, Sparkles, BookOpen, RefreshCw } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import MediaCard from '../components/MediaCard';
import EmptyState from '../components/EmptyState';
import { api, ApiClientError, tmdbImage } from '../lib/api';
import { useApp } from '../lib/context';
import type { AddonMeta, MediaItem, WatchProgress } from '../types';
import { listWatchProgress } from '../lib/progress';

type AddonSection={addonId:string;addonName:string;type:string;catalogId:string;catalogName:string;items:AddonMeta[]};
export default function Discover() {
  const { addons, edition, library, settings, activeProfileId } = useApp();
  const navigate = useNavigate();
  const [items, setItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [addonSections,setAddonSections]=useState<AddonSection[]>([]);
  const [addonLoading,setAddonLoading]=useState(false);
  const [continueItems,setContinueItems]=useState<WatchProgress[]>([]);
  const [heroTrailerKey,setHeroTrailerKey]=useState('');
  useEffect(() => {
    let active = true;
    api.trending(settings.preferredLanguage).then((result) => { if (active) setItems((result.results ?? []).filter((item) => item.media_type === 'movie' || item.media_type === 'tv')); })
      .catch((reason: unknown) => { if (active) setError(reason instanceof ApiClientError ? reason.message : 'Não foi possível carregar o catálogo.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [settings.preferredLanguage]);
  useEffect(()=>{ let active=true; listWatchProgress(activeProfileId).then(items=>{if(active)setContinueItems(items);}).catch(()=>undefined); return()=>{active=false;}; },[activeProfileId]);
  useEffect(()=>{
    let active=true;setAddonLoading(true);
    const jobs=addons.filter(addon=>addon.enabled!==false).flatMap(addon=>(addon.manifest.catalogs??[]).slice(0,3).map(async catalog=>{
      try{const response=await api.addonResource({manifestUrl:addon.manifestUrl,resource:'catalog',type:catalog.type,id:catalog.id,extra:{skip:'0'}});return {addonId:addon.manifest.id,addonName:addon.manifest.name,type:catalog.type,catalogId:catalog.id,catalogName:catalog.name,items:(response.data.metas??[]) as unknown as AddonMeta[]} as AddonSection;}catch{return null;}
    }));
    Promise.all(jobs).then(results=>{if(active)setAddonSections(results.filter((entry):entry is AddonSection=>Boolean(entry&&entry.items.length)));}).finally(()=>{if(active)setAddonLoading(false);});
    return()=>{active=false;};
  },[addons]);
  const hero = items[0];
  useEffect(()=>{
    let active=true;
    setHeroTrailerKey('');
    if(!settings.trailerAutoplay||!hero||!(hero.media_type==='movie'||hero.media_type==='tv'))return()=>{active=false;};
    api.details(hero.media_type==='tv'?'tv':'movie',hero.id,settings.preferredLanguage).then(result=>{
      const trailer=result.videos?.results?.find(video=>video.site==='YouTube'&&video.type==='Trailer');
      if(active)setHeroTrailerKey(trailer?.key??'');
    }).catch(()=>{if(active)setHeroTrailerKey('');});
    return()=>{active=false;};
  },[hero?.id,hero?.media_type,settings.trailerAutoplay,settings.preferredLanguage]);
  return (
    <div className="page-stack">
      <section className={`welcome-hero ${edition === 'enhanced' ? 'welcome-enhanced' : ''} ${settings.homeHeroStyle === 'card' ? 'hero-card-style' : 'hero-full-style'} ${settings.showCatalogUnderline ? 'catalog-underline' : ''}`}>
        <div className="hero-orb orb-one" /><div className="hero-orb orb-two" />
        <div className="hero-copy">
          <span className="hero-kicker"><Sparkles size={14} /> SUA CENTRAL DE MÍDIA</span>
          <h2>{edition === 'enhanced' ? 'Descubra. Personalize. Assista.' : 'Tudo o que você acompanha, em um só lugar.'}</h2>
          <p>Conecte addons e organize filmes, séries, canais e fontes que você tem autorização para acessar.</p>
          <div className="hero-actions"><Link to="/addons" className="button-primary"><Plus size={16} /> Adicionar addon</Link><Link to="/library" className="button-quiet">Minha biblioteca <ArrowRight size={15} /></Link></div>
        </div>
        {hero ? <div className={`hero-poster ${heroTrailerKey?'hero-trailer-active':''}`} aria-hidden="true">{hero.backdrop_path && <img src={`https://image.tmdb.org/t/p/w780${hero.backdrop_path}`} alt="" />}{heroTrailerKey&&settings.trailerAutoplay&&<iframe src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(heroTrailerKey)}?autoplay=1&mute=1&controls=0&loop=1&playlist=${encodeURIComponent(heroTrailerKey)}&playsinline=1&rel=0`} title="Trailer em destaque" loading="lazy" allow="autoplay; encrypted-media; picture-in-picture"/>}<div className="hero-poster-shade" /><div className="hero-poster-caption"><span>{heroTrailerKey&&settings.trailerAutoplay?'TRAILER EM DESTAQUE':'EM DESTAQUE'}</span><strong>{(settings.showOriginalTitles ? hero.original_title ?? hero.original_name : undefined) ?? hero.title ?? hero.name}</strong></div></div> : <div className="hero-art"><div className="hero-art-disc"><Clapperboard size={42} /></div><span>NUVIO WEB</span></div>}
      </section>
      {error && <div className="notice notice-warning"><CircleAlert size={18} /><div><b>Catálogo TMDB não configurado</b><span>{error} Configure TMDB_API_READ_TOKEN na Render para habilitar os metadados.</span></div></div>}
      {continueItems.length>0&&<section className="section-block"><div className="section-heading"><div><span className="eyebrow">RETOMAR</span><h2>Continue assistindo</h2></div><span className="section-aside">Neste navegador</span></div><div className="continue-watching-list">{continueItems.slice(0,8).map(progress=><button key={progress.mediaKey} className="continue-watching-card" onClick={()=>navigate(progress.item.sourceProvider==='anilist'?`/anilist/${progress.item.sourceId??progress.item.id}`:`/details/${progress.item.media_type??'movie'}/${progress.item.id}`)}><div className="continue-poster">{progress.item.poster_path&&<img src={tmdbImage(progress.item.poster_path)} alt=""/>}<i style={{width:`${Math.min(100,progress.position/progress.duration*100)}%`}}/></div><b>{progress.item.title??progress.item.name??'Continuar'}</b><span>{Math.floor(progress.position/60)} de {Math.floor(progress.duration/60)} min</span></button>)}</div></section>}
      <section className="section-block"><div className="section-heading"><div><span className="eyebrow">CATÁLOGO TMDB</span><h2>Em alta agora</h2></div><span className="section-aside">Metadados via TMDB</span></div>
        {loading ? <div className="skeleton-grid">{Array.from({ length: 6 }).map((_, index) => <div className="skeleton-card" key={index} />)}</div> : items.length > 0 ? <div className="media-grid">{items.slice(0, 12).map((item) => <MediaCard key={`${item.media_type}-${item.id}`} item={item} />)}</div> : <EmptyState icon={<Clapperboard size={22} />} title="Seu catálogo começa aqui" message="Configure TMDB_API_READ_TOKEN na API Render e instale seus addons para carregar catálogos e fontes." action={<Link className="button-secondary" to="/addons">Gerenciar addons</Link>} />}
      </section>
      {addonSections.length>0&&<section className="section-block addon-home-catalogs"><div className="section-heading"><div><span className="eyebrow">SUAS FONTES</span><h2>Catálogos dos addons</h2></div><Link className="text-button" to="/addons">Gerenciar addons <ArrowRight size={14}/></Link></div>{addonSections.map(section=><div className="addon-home-row" key={`${section.addonId}-${section.catalogId}`}><div className="section-heading compact-heading"><div><span className="eyebrow">{section.addonName}</span><h3>{section.catalogName}</h3></div><Link className="text-button" to={`/addons/catalog/${encodeURIComponent(section.addonId)}/${encodeURIComponent(section.type)}/${encodeURIComponent(section.catalogId)}`}>Ver tudo <ArrowRight size={13}/></Link></div><div className="addon-meta-row">{section.items.slice(0,8).map(item=><button className="addon-meta-card" key={item.id} onClick={()=>navigate('/addon-meta',{state:{addonMeta:item,manifestUrl:addons.find(a=>a.manifest.id===section.addonId)?.manifestUrl,addonName:section.addonName}})}><div className="addon-meta-poster">{item.poster&&<img src={item.poster} alt="" loading="lazy"/>}</div><b>{item.name}</b><span>{item.releaseInfo??item.type}</span></button>)}</div></div>)}</section>}
      {addons.length>0&&addonLoading&&<div className="loading-screen small-loading"><RefreshCw className="spin" size={17}/> Carregando catálogos dos addons…</div>}
      <section className="section-block two-column-section">
        <div className="mini-feature"><div className="mini-feature-icon"><Plus size={20} /></div><div><span className="eyebrow">FONTES</span><h3>{addons.length ? `${addons.length} addon(s) conectado(s)` : 'Adicione suas próprias fontes'}</h3><p>Catálogos, metadados, streams e legendas compatíveis com protocolo Stremio.</p><Link to="/addons">Abrir gerenciador <ArrowRight size={14} /></Link></div></div>
        <div className="mini-feature"><div className="mini-feature-icon"><Clapperboard size={20} /></div><div><span className="eyebrow">BIBLIOTECA</span><h3>{library.length ? `${library.length} título(s) salvos` : 'Sua coleção, do seu jeito'}</h3><p>Salve títulos neste perfil e organize em coleções.</p><Link to="/library">Ver biblioteca <ArrowRight size={14} /></Link></div></div>
      </section>
      <div className="disclaimer-line">Nuvio Web Port é um projeto comunitário independente. Não hospeda nem fornece conteúdo audiovisual.</div>
    </div>
  );
}
