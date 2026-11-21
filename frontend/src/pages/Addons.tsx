import { useEffect, useMemo, useState } from 'react';
import { BookOpen, CheckCircle2, ExternalLink, Filter, Puzzle, RefreshCw, ShieldCheck, Trash2, UploadCloud, ArrowUp, ArrowDown, ToggleLeft, ToggleRight, Settings2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api, ApiClientError } from '../lib/api';
import { useApp } from '../lib/context';
import EmptyState from '../components/EmptyState';
import type { AddonManifest, InstalledAddon } from '../types';
import { trackEvent } from '../lib/analytics';

type DirectoryEntry={name:string;description?:string;manifestUrl:string;adult?:boolean;category?:string;configurable?:boolean};
const BLOCKED_ADDON_MARKERS=/\b(adult|xxx|18\+|casino|betting|sportsbook|gambling|poker|drug|cannabis|weapon|firearm)\b/i;
const OFFICIAL_BASE=[
  {name:'Nuvio Catalog',url:'https://catalog.nuvio.tv/manifest.json'},
  {name:'OpenSubtitles v3',url:'https://opensubtitles-v3.strem.io/manifest.json'},
];

function addonConfigureUrl(manifestUrl:string):string {
  const url=new URL(manifestUrl);
  const path=url.pathname;
  const manifestIndex=path.toLowerCase().lastIndexOf('/manifest.json');
  url.pathname=manifestIndex>=0?`${path.slice(0,manifestIndex)}/configure`:`${path.replace(/\/$/,'')}/configure`;
  url.search='';url.hash='';
  return url.toString();
}
function openAddonConfigurator(manifestUrl:string){
  window.open(addonConfigureUrl(manifestUrl),'_blank','noopener,noreferrer');
}


export default function Addons() {
  const { addons, setAddons, settings, edition } = useApp();
  const [manifestUrl, setManifestUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [directoryLoading,setDirectoryLoading]=useState(false);
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);
  const [preview, setPreview] = useState<AddonManifest | null>(null);
  const [directory,setDirectory]=useState<DirectoryEntry[]>([]);
  const [directorySource,setDirectorySource]=useState('');
  const [filteredCount,setFilteredCount]=useState(0);
  const enabledCount=useMemo(()=>addons.filter(addon=>addon.enabled!==false).length,[addons]);

  async function inspectAndInstall(url:string,expectedName?:string){
    const result=await api.inspectAddon(url);
    const manifest=result.manifest;
    if(manifest.behaviorHints?.adult===true||BLOCKED_ADDON_MARKERS.test(`${manifest.name} ${manifest.description??''}`))throw new Error(`${manifest.name} foi bloqueado pela política de conteúdo deste perfil.`);
    if(manifest.behaviorHints?.configurationRequired===true)throw new Error(`${manifest.name} exige configuração. Configure pelo site oficial e cole a URL de manifest personalizada.`);
    const existing=addons.findIndex(addon=>addon.manifest.id===manifest.id&&addon.manifestUrl===result.manifestUrl);
    if(existing>=0)return `${manifest.name} já estava instalado.`;
    const installed:InstalledAddon={manifestUrl:result.manifestUrl,manifest,installedAt:new Date().toISOString(),enabled:true,pinned:false,order:addons.length};
    setAddons(current=>[...current,installed]);
    if(settings.analyticsOptIn)trackEvent('addon_installed',edition,{route:'/addons',provider:'manifest'});
    return `${expectedName??manifest.name} instalado com sucesso.`;
  }

  async function installAddon(event: React.FormEvent) {
    event.preventDefault();setMessage(null);setPreview(null);setLoading(true);
    try {
      const result=await api.inspectAddon(manifestUrl.trim());
      if(result.manifest.behaviorHints?.adult===true||BLOCKED_ADDON_MARKERS.test(`${result.manifest.name} ${result.manifest.description??''}`))throw new Error('Este addon foi bloqueado pela política de conteúdo deste perfil.');
      setPreview(result.manifest);
      if(result.manifest.behaviorHints?.configurationRequired===true){setMessage({type:'error',text:'Este addon exige configuração antes da instalação. Abra o configurador e depois cole o manifest configurado.'});return;}
      const exists=addons.some(addon=>addon.manifest.id===result.manifest.id&&addon.manifestUrl===result.manifestUrl);
      if(exists)setMessage({type:'error',text:'Esse addon já está instalado.'});
      else{
        setAddons(current=>[...current,{manifestUrl:result.manifestUrl,manifest:result.manifest,installedAt:new Date().toISOString(),enabled:true,pinned:false,order:current.length}]);
        if(settings.analyticsOptIn)trackEvent('addon_installed',edition,{route:'/addons',provider:'manifest'});
        setManifestUrl('');setMessage({type:'ok',text:`${result.manifest.name} foi adicionado a este perfil.`});
      }
    }catch(error){setMessage({type:'error',text:error instanceof Error?error.message:error instanceof ApiClientError?error.message:'Não foi possível verificar esse manifest.'});}
    finally{setLoading(false);}
  }

  async function installOfficialBase(){
    setLoading(true);setMessage(null);let successes=0;const errors:string[]=[];
    for(const entry of OFFICIAL_BASE){try{await inspectAndInstall(entry.url,entry.name);successes++;}catch(error){errors.push(error instanceof Error?error.message:String(error));}}
    setMessage(errors.length?{type:'error',text:`${successes} addon(s) verificado(s). ${errors.join(' ')}`}:{type:'ok',text:`Base oficial verificada: ${successes} addon(s) disponíveis.`});
    setLoading(false);
  }

  async function loadDirectory(){
    setDirectoryLoading(true);setMessage(null);
    try{
      const url=settings.curatedAddonFeedUrl?.trim();
      const result=url?await api.addonDirectory(url):await fetch(`${import.meta.env.BASE_URL}curated-addons.json`).then(async response=>{if(!response.ok)throw new Error('Não foi possível carregar o catálogo padrão.');return response.json() as Promise<{addons:DirectoryEntry[];name?:string}>;});
      const entries=Array.isArray(result.addons)?result.addons.filter(entry=>entry.adult!==true&&!BLOCKED_ADDON_MARKERS.test(`${entry.name} ${entry.description??''} ${entry.category??''}`)):[];
      setDirectory(entries);setDirectorySource('source' in result?result.source:'Catálogo curado do repositório');setFilteredCount('filteredCount' in result?result.filteredCount:0);
    }catch(error){setMessage({type:'error',text:error instanceof Error?error.message:'Falha ao carregar o feed curado.'});}
    finally{setDirectoryLoading(false);}
  }

  useEffect(()=>{void loadDirectory();},[settings.curatedAddonFeedUrl]);

  async function installDirectoryEntry(entry:DirectoryEntry){
    setLoading(true);setMessage(null);
    try{const result=await api.inspectAddon(entry.manifestUrl);if(result.manifest.behaviorHints?.adult===true||BLOCKED_ADDON_MARKERS.test(`${result.manifest.name} ${result.manifest.description??''}`))throw new Error('Este addon foi bloqueado pela política de conteúdo deste perfil.');if(result.manifest.behaviorHints?.configurationRequired)throw new Error('Configure este addon no site do desenvolvedor antes de instalar.');
      const exists=addons.some(addon=>addon.manifest.id===result.manifest.id&&addon.manifestUrl===result.manifestUrl);
      if(exists)setMessage({type:'error',text:`${entry.name} já está instalado.`});else{setAddons(current=>[...current,{manifestUrl:result.manifestUrl,manifest:result.manifest,installedAt:new Date().toISOString(),enabled:true,pinned:false,order:current.length}]);if(settings.analyticsOptIn)trackEvent('addon_installed',edition,{route:'/addons',provider:'curated-feed'});setMessage({type:'ok',text:`${entry.name} instalado.`});}
    }catch(error){setMessage({type:'error',text:error instanceof Error?error.message:'Falha ao instalar addon.'});}
    finally{setLoading(false);}
  }

  function changeAddon(index:number,direction:-1|1){setAddons(current=>{const next=[...current];const target=index+direction;if(target<0||target>=next.length)return current;[next[index],next[target]]=[next[target],next[index]];return next.map((addon,order)=>({...addon,order}));});}
  function toggleAddon(addon:InstalledAddon){setAddons(current=>current.map(entry=>entry.manifestUrl===addon.manifestUrl?{...entry,enabled:entry.enabled===false}:entry));}

  return <div className="page-stack narrow-page">
    <section className="page-intro"><span className="eyebrow">INTEGRAÇÕES</span><h2>Seus addons</h2><p>Catálogos, metadados, streams e legendas via protocolo Stremio. Cada manifest é validado antes da instalação.</p></section>
    <section className="panel addon-install-panel"><div className="panel-heading"><div className="panel-icon"><Puzzle size={20}/></div><div><h3>Base oficial do Nuvio</h3><p>Instala os addons de catálogo e legendas configurados no projeto.</p></div></div>
      <div className="addon-featured-row"><div><b>Nuvio Catalog</b><span>Catálogos oficiais e metadados TMDB.</span></div><div><b>OpenSubtitles v3</b><span>Legendas de filmes e séries.</span></div></div>
      <button className="button-primary" onClick={()=>void installOfficialBase()} disabled={loading}><UploadCloud size={16}/> {loading?'Verificando manifests…':'Instalar / verificar base oficial'}</button>
    </section>
    <section className="panel addon-install-panel"><div className="panel-heading"><div className="panel-icon"><BookOpen size={20}/></div><div><h3>Catálogo curado</h3><p>Lista privada de addons revisados por você e mantidos no seu feed JSON.</p></div></div>
      <div className="addon-directory-summary"><span>{directory.length} entrada(s)</span><span>{directorySource}</span>{filteredCount>0&&<span>{filteredCount} entrada(s) adulta(s) descartada(s)</span>}</div>
      <button className="button-secondary" onClick={()=>void loadDirectory()} disabled={directoryLoading}><RefreshCw size={15} className={directoryLoading?'spin':''}/> Atualizar catálogo curado</button>
      {directory.length>0&&<div className="addon-list">{directory.map(entry=><article className="addon-card" key={entry.manifestUrl}><div className="addon-avatar"><Puzzle size={18}/></div><div className="addon-main"><h3>{entry.name}</h3><p>{entry.description??'Addon da lista curada.'}</p><small className="muted-url">{entry.manifestUrl}</small></div><div className="addon-card-side-actions">{entry.configurable&&<button className="button-secondary small-button" onClick={()=>openAddonConfigurator(entry.manifestUrl)}>Configurar</button>}<button className="button-secondary small-button" onClick={()=>void installDirectoryEntry(entry)} disabled={loading}>Instalar</button></div></article>)}</div>}
      <div className="security-note"><ShieldCheck size={17}/><span>O feed deve conter somente addons que você revisou e tem autorização para usar. Entradas declaradas como adultas são omitidas e manifests que sinalizam conteúdo adulto não podem ser instalados.</span></div>
    </section>
    <section className="panel addon-install-panel"><div className="panel-heading"><div className="panel-icon"><Puzzle size={20}/></div><div><h3>Adicionar por manifest</h3><p>Informe a URL HTTPS do manifest.json ou endpoint de manifest.</p></div></div>
      <form className="addon-form" onSubmit={installAddon}><label htmlFor="manifest-url">URL do manifest</label><div className="input-action-row"><input id="manifest-url" type="url" required maxLength={2048} placeholder="https://exemplo.com/manifest.json" value={manifestUrl} onChange={event=>setManifestUrl(event.target.value)}/><button className="button-primary" disabled={loading}>{loading?<RefreshCw className="spin" size={16}/>:<Puzzle size={16}/>} Verificar e adicionar</button></div></form>
      {message&&<div className={`inline-message ${message.type}`}><span>{message.type==='ok'?<CheckCircle2 size={16}/>:<ShieldCheck size={16}/>}</span>{message.text}</div>}
      {preview&&<div className="manifest-preview"><b>{preview.name}</b><span>{preview.description||'Sem descrição'}</span><small>{preview.id} · versão {preview.version??'não informada'}</small>{(preview.behaviorHints?.configurable===true||Array.isArray(preview.config))&&<button className="button-secondary small-button" type="button" onClick={()=>openAddonConfigurator(manifestUrl.trim())}>Abrir configurador oficial</button>}</div>}
      <div className="security-note"><ShieldCheck size={17}/><span>O proxy da API bloqueia IPs privados e respostas muito grandes para reduzir risco de SSRF.</span></div>
    </section>
    <div className="section-heading compact-heading"><div><span className="eyebrow">PERFIL ATUAL</span><h2>Instalados <span className="count-bubble">{addons.length}</span> <small className="addon-enabled-count">{enabledCount} ativos</small></h2></div></div>
    {addons.length?<div className="addon-list">{addons.map((addon,index)=><article className={`addon-card ${addon.enabled===false?'addon-disabled':''}`} key={`${addon.manifest.id}-${addon.manifestUrl}`}><div className="addon-avatar"><Puzzle size={19}/></div><div className="addon-main"><h3>{addon.manifest.name}</h3><p>{addon.manifest.description||'Addon sem descrição.'}</p><div className="addon-tags">{(addon.manifest.resources??[]).slice(0,4).map(resource=><span key={typeof resource==='string'?resource:resource.name}>{typeof resource==='string'?resource:resource.name}</span>)}{addon.manifest.catalogs?.length?<span>{addon.manifest.catalogs.length} catálogo(s)</span>:null}</div><small className="muted-url">{addon.manifestUrl}</small>{addon.manifest.catalogs?.length?<div className="addon-catalog-links"><span>Catálogos:</span>{addon.manifest.catalogs.map(catalog=><Link key={`${catalog.type}-${catalog.id}`} to={`/addons/catalog/${encodeURIComponent(addon.manifest.id)}/${encodeURIComponent(catalog.type)}/${encodeURIComponent(catalog.id)}`}><BookOpen size={12}/>{catalog.name}</Link>)}</div>:null}</div><div className="addon-actions"><button className="icon-button" onClick={()=>changeAddon(index,-1)} disabled={index===0} aria-label="Mover para cima"><ArrowUp size={15}/></button><button className="icon-button" onClick={()=>changeAddon(index,1)} disabled={index===addons.length-1} aria-label="Mover para baixo"><ArrowDown size={15}/></button><button className="icon-button" onClick={()=>toggleAddon(addon)} aria-label={addon.enabled===false?'Ativar':'Desativar'}>{addon.enabled===false?<ToggleLeft size={16}/>:<ToggleRight size={16}/>}</button>{(addon.manifest.behaviorHints?.configurable===true||Array.isArray(addon.manifest.config))&&<button className="icon-button" onClick={()=>openAddonConfigurator(addon.manifestUrl)} aria-label={`Configurar ${addon.manifest.name}`} title="Configurar addon"><Settings2 size={15}/></button>}<a href={addon.manifestUrl} target="_blank" rel="noreferrer" className="icon-button" aria-label="Abrir manifest"><ExternalLink size={16}/></a><button className="icon-button danger-button" aria-label={`Remover ${addon.manifest.name}`} onClick={()=>{setAddons(current=>current.filter(entry=>entry.manifestUrl!==addon.manifestUrl));if(settings.analyticsOptIn)trackEvent('addon_removed',edition,{route:'/addons',provider:'manifest'});}}><Trash2 size={16}/></button></div></article>)}</div>:<EmptyState icon={<Puzzle size={22}/>} title="Nenhum addon instalado" message="Instale a base oficial ou adicione um manifest HTTPS para começar."/>}
    <div className="notice notice-info"><ShieldCheck size={18}/><div><b>Ordem e disponibilidade</b><span>Os addons são consultados na ordem da lista. Um addon desativado permanece instalado, mas não participa das consultas. A lista é separada por perfil.</span></div></div>
  </div>;
}
