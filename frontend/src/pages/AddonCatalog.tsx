import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Filter, RefreshCw } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useApp } from '../lib/context';
import { api, ApiClientError } from '../lib/api';
import type { AddonMeta } from '../types';

export default function AddonCatalog(){
 const {addonId='',type='movie',catalogId=''}=useParams();const {addons}=useApp();const navigate=useNavigate();
 const addon=addons.find(item=>encodeURIComponent(item.manifest.id)===addonId||item.manifest.id===decodeURIComponent(addonId));
 const catalog=addon?.manifest.catalogs?.find(item=>item.id===catalogId&&item.type===type);
 const [items,setItems]=useState<AddonMeta[]>([]);const [skip,setSkip]=useState(0);const [loading,setLoading]=useState(false);const [error,setError]=useState('');const [extra,setExtra]=useState<Record<string,string>>({});
 const extraFields=catalog?.extra??[];const title=useMemo(()=>catalog?.name??'Catálogo do addon',[catalog]);
 async function load(reset=true){if(!addon||!catalog)return;setLoading(true);setError('');const next=reset?0:skip;try{const result=await api.addonResource({manifestUrl:addon.manifestUrl,resource:'catalog',type,id:catalog.id,extra:{...extra,...(next?{skip:String(next)}:{})}});const metas=(result.data.metas??[]) as unknown as AddonMeta[];setItems(current=>reset?metas:[...current,...metas]);setSkip(next+metas.length);}catch(e){setError(e instanceof ApiClientError?e.message:'Não foi possível consultar o catálogo.');}finally{setLoading(false);}}
 useEffect(()=>{setItems([]);setSkip(0);void load(true);},[addonId,type,catalogId]);
 if(!addon||!catalog)return <div className="page-stack"><Link className="back-link" to="/addons">Voltar aos addons</Link><div className="notice notice-warning">Esse catálogo não está instalado ou foi removido.</div></div>;
 return <div className="page-stack"><button className="back-link" onClick={()=>navigate(-1)}><ArrowLeft size={15}/> Voltar</button><section className="page-intro"><span className="eyebrow">{addon.manifest.name}</span><h2>{title}</h2><p>Catálogo externo fornecido pelo addon instalado. {addon.manifest.description}</p></section>
 {extraFields.length>0&&<section className="catalog-filter-panel">{extraFields.map(field=><label key={field.name}>{field.name}<select value={extra[field.name]??''} onChange={e=>setExtra(current=>({...current,[field.name]:e.target.value}))}><option value="">Todos</option>{(field.options??[]).map(option=><option key={option} value={option}>{option}</option>)}</select></label>)}<button className="button-secondary" onClick={()=>void load(true)} disabled={loading}><Filter size={15}/> Aplicar filtros</button></section>}
 {error&&<div className="notice notice-warning">{error}</div>}
 {items.length?<div className="media-grid">{items.map(item=><button className="addon-meta-card" key={item.id} onClick={()=>navigate('/addon-meta',{state:{addonMeta:item,manifestUrl:addon.manifestUrl,addonName:addon.manifest.name}})}><div className="addon-meta-poster">{item.poster&&<img src={item.poster} alt="" loading="lazy"/>}</div><b>{item.name}</b><span>{item.releaseInfo??item.type}</span></button>)}</div>:!loading&&!error?<div className="empty-state"><h3>Catálogo vazio</h3><p>O addon não retornou títulos para este filtro.</p></div>:null}
 <div className="catalog-pagination"><button className="button-secondary" onClick={()=>void load(false)} disabled={loading||!items.length}>{loading?<RefreshCw size={15} className="spin"/>:<RefreshCw size={15}/>} Carregar mais</button></div>
 </div>;
}
