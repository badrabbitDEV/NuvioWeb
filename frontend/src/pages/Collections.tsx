import { useMemo, useState } from 'react';
import { FolderHeart, Plus, Trash2, Bookmark } from 'lucide-react';
import { useStoredState } from '../lib/storage';
import { useApp } from '../lib/context';
import MediaCard from '../components/MediaCard';
import type { MediaItem } from '../types';
import { createCollection, mediaKeyOf, toggleCollectionItem, type Collection } from '../features/collections';

const keyOf = mediaKeyOf;
export default function Collections(){
 const {library,activeProfileId}=useApp();const [collections,setCollections]=useStoredState<Collection[]>(`nuvio-web:${activeProfileId}:collections`,[]);const [name,setName]=useState('');const [selected,setSelected]=useState('');
 const active=collections.find(c=>c.id===selected);const items=useMemo(()=>active?library.filter(item=>active.mediaKeys.includes(keyOf(item))):[],[active,library]);
 function create(event:React.FormEvent){event.preventDefault();const value=name.trim().slice(0,40);if(!value)return;const collection=createCollection(value);setCollections(c=>[...c,collection]);setSelected(collection.id);setName('');}
 function toggle(item:MediaItem){if(!active)return;const mediaKey=keyOf(item);setCollections(c=>c.map(collection=>collection.id===active.id?toggleCollectionItem(collection,mediaKey):collection));}
 return <div className="page-stack"><section className="page-intro"><span className="eyebrow">ORGANIZAÇÃO</span><h2>Coleções</h2><p>Crie pastas personalizadas para organizar filmes e séries salvos na sua biblioteca.</p></section>
 <form className="inline-create-form" onSubmit={create}><input value={name} onChange={e=>setName(e.target.value)} placeholder="Nome da nova coleção" maxLength={40}/><button className="button-primary" disabled={!name.trim()}><Plus size={15}/> Criar</button></form>
 <div className="collection-layout"><aside className="collection-list">{collections.map(c=><button key={c.id} className={`collection-row ${selected===c.id?'active':''}`} onClick={()=>setSelected(c.id)}><FolderHeart size={17}/><span>{c.name}</span><small>{c.mediaKeys.length}</small></button>)}{!collections.length&&<p className="muted-copy">Suas coleções aparecerão aqui.</p>}</aside><section className="collection-content">{active?<><div className="section-heading"><div><span className="eyebrow">COLEÇÃO</span><h2>{active.name}</h2></div><button className="icon-button danger-button" onClick={()=>{setCollections(c=>c.filter(v=>v.id!==active.id));setSelected('');}} title="Excluir coleção"><Trash2 size={16}/></button></div><p className="muted-copy">{items.length} item(ns) nesta coleção. Para adicionar, use as opções abaixo.</p>{items.length?<div className="media-grid">{items.map(item=><MediaCard key={keyOf(item)} item={item}/>)}</div>:<div className="empty-state"><div className="empty-icon"><FolderHeart size={22}/></div><h3>Coleção vazia</h3><p>Adicione itens da sua biblioteca.</p></div>}<div className="collection-picker">{library.filter(item=>!active.mediaKeys.includes(keyOf(item))).map(item=><button key={keyOf(item)} onClick={()=>toggle(item)}><Bookmark size={14}/>{item.title??item.name??`ID ${item.id}`}</button>)}</div></>:<div className="empty-state"><div className="empty-icon"><FolderHeart size={22}/></div><h3>Selecione uma coleção</h3><p>Crie uma nova coleção para começar.</p></div>}</section></div></div>;
}
