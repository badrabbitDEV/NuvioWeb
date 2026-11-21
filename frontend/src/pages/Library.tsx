import { Bookmark, Trash2 } from 'lucide-react';
import MediaCard from '../components/MediaCard';
import EmptyState from '../components/EmptyState';
import { useApp } from '../lib/context';

export default function Library() {
  const { library, setLibrary } = useApp();
  return (
    <div className="page-stack">
      <section className="page-intro"><span className="eyebrow">COLEÇÃO PESSOAL</span><h2>Minha biblioteca</h2><p>Seus títulos salvos neste navegador, sem sincronização externa.</p></section>
      {library.length ? <><div className="library-toolbar"><span>{library.length} título(s)</span><button className="text-button danger-text" onClick={() => setLibrary([])}><Trash2 size={15} /> Limpar biblioteca</button></div><div className="media-grid">{library.map((item) => <MediaCard key={`${item.media_type}-${item.id}`} item={item} />)}</div></> : <EmptyState icon={<Bookmark size={22} />} title="Sua biblioteca está vazia" message="Abra um filme ou série e use o botão Salvar para guardar aqui." />}
    </div>
  );
}
