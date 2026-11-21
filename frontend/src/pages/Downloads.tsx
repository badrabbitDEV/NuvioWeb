import { useEffect, useMemo, useState } from 'react';
import { Download, Trash2, Play, HardDrive, RefreshCw, FolderOpen } from 'lucide-react';
import { createOfflineObjectUrl, downloadRemoteFile, estimateStorage, formatBytes, listDownloads, removeDownload } from '../features/downloads';
import { notifyUser } from '../features/notifications';
import type { DownloadRecord } from '../types';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../lib/context';


export default function Downloads() {
  const navigate = useNavigate();
  const { activeProfileId } = useApp();
  const [items,setItems]=useState<DownloadRecord[]>([]);
  const [url,setUrl]=useState('');
  const [title,setTitle]=useState('');
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');
  const [progress,setProgress]=useState(0);
  const [storage,setStorage]=useState<{usage?:number;quota?:number}>({});
  async function refresh(){try{setItems(await listDownloads(activeProfileId));setStorage(await estimateStorage());}catch(e){setError(e instanceof Error?e.message:'IndexedDB não disponível.');}}
  useEffect(()=>{void refresh();},[activeProfileId]);
  const total=useMemo(()=>items.reduce((sum,item)=>sum+item.size,0),[items]);
  async function save(event:React.FormEvent){event.preventDefault();setLoading(true);setError('');setProgress(0);
    try{
      await downloadRemoteFile({url,title,profileId:activeProfileId,onProgress:setProgress});
      setUrl('');setTitle('');await refresh();
      notifyUser({title:'Download salvo',body:'O arquivo foi guardado no armazenamento offline deste navegador.',tag:'download-saved',osNotification:true});
    }catch(e){setError(e instanceof Error?e.message:'Falha ao salvar o arquivo. A origem pode bloquear CORS.');}
    finally{setLoading(false);}
  }
  async function play(record:DownloadRecord){if(!record.blob)return;const objectUrl=createOfflineObjectUrl(record);navigate('/watch',{state:{stream:{url:objectUrl,name:record.title,mimeType:record.mimeType},mediaTitle:record.title,offline:true}});}
  async function remove(record:DownloadRecord){await removeDownload(record.id);await refresh();}
  return <div className="page-stack narrow-page"><section className="page-intro"><span className="eyebrow">ENHANCED · OFFLINE</span><h2>Downloads</h2><p>Guarde arquivos diretos autorizados no armazenamento deste navegador e reproduza sem conexão enquanto o dispositivo mantiver os dados locais.</p></section>
    <div className="two-column-section"><div className="stat-card"><HardDrive size={18}/><b>{formatBytes(total)}</b><span>Biblioteca offline ({items.length} arquivos)</span></div><div className="stat-card"><FolderOpen size={18}/><b>{storage.quota?`${Math.round((storage.usage??0)/storage.quota*100)}%`: '—'}</b><span>Uso estimado do armazenamento do navegador</span></div></div>
    <form className="panel" onSubmit={save}><div className="panel-heading"><div className="panel-icon"><Download size={20}/></div><div><h3>Salvar arquivo para offline</h3><p>Arquivo direto HTTPS, até 500 MB por item nesta interface.</p></div></div><label>Título</label><input className="wide-input" value={title} onChange={e=>setTitle(e.target.value)} placeholder="Nome do vídeo ou arquivo"/><label>URL HTTPS</label><input className="wide-input" type="url" value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://.../video.mp4" required/><button className="button-primary full-button" disabled={loading}>{loading?<RefreshCw size={15} className="spin"/>:<Download size={15}/>} {loading?`Salvando ${progress?`${progress.toFixed(0)}%`:''}`:'Salvar no dispositivo'}</button>{error&&<div className="inline-message error">{error}</div>}</form>
    <section className="section-block"><div className="section-heading"><div><span className="eyebrow">NESTE NAVEGADOR</span><h2>Arquivos salvos</h2></div><button className="text-button" onClick={()=>void refresh()}><RefreshCw size={14}/> Atualizar</button></div>
      {items.length? <div className="download-list">{items.map(item=><article className="download-item" key={item.id}><div className="panel-icon"><Download size={18}/></div><div className="download-item-main"><b>{item.title}</b><span>{formatBytes(item.size)} · {new Date(item.createdAt).toLocaleDateString()}</span></div><button className="icon-button" onClick={()=>void play(item)} disabled={!item.blob} title="Reproduzir"><Play size={16}/></button><button className="icon-button danger-button" onClick={()=>void remove(item)} title="Excluir"><Trash2 size={16}/></button></article>)}</div>:<div className="empty-state"><div className="empty-icon"><Download size={22}/></div><h3>Nenhum arquivo offline</h3><p>Adicione uma URL direta para salvar uma cópia local, se a origem permitir CORS.</p></div>}
    </section>
    <div className="notice notice-warning"><HardDrive size={17}/><div><b>Limites do armazenamento web</b><span>Este módulo não baixa torrents para seed, não ignora DRM e não substitui os gerenciadores nativos do Android/iOS. O navegador pode limpar dados locais e a fonte precisa permitir CORS e requisições de leitura.</span></div></div>
  </div>;
}
