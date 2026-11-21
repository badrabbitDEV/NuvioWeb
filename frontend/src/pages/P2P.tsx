import { useRef, useState } from 'react';
import { AlertTriangle, Copy, FileUp, Info, Network, Play, ShieldCheck, Zap, Upload, Square } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../lib/context';
import { trackEvent } from '../lib/analytics';
import { formatP2PBytes, formatP2PSpeed, isInfoHash, seedLocalFile, supportsBrowserP2P, type P2PSeedSession, type P2PStats } from '../lib/p2p';

export default function P2P() {
  const navigate = useNavigate();
  const { edition, settings } = useApp();
  const fileRef = useRef<HTMLInputElement>(null);
  const [identifier, setIdentifier] = useState('');
  const [error, setError] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [seedFile, setSeedFile] = useState<File | null>(null);
  const [seedSession, setSeedSession] = useState<P2PSeedSession | null>(null);
  const [seedStats, setSeedStats] = useState<P2PStats | null>(null);
  const [seedBusy,setSeedBusy]=useState(false);
  const supported = supportsBrowserP2P();

  function openMagnet(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    const value = identifier.trim();
    if (!value.toLowerCase().startsWith('magnet:?') && !isInfoHash(value)) {
      setError('Informe um magnet URI válido ou um infoHash de 40 caracteres hexadecimais / 32 caracteres base32.');
      return;
    }
    if (settings.analyticsOptIn) trackEvent('p2p_started', edition, { route: '/p2p', provider: value.startsWith('magnet:') ? 'magnet' : 'infohash' });
    navigate('/watch', { state: { stream: { name: 'Fonte P2P informada manualmente', url: value.startsWith('magnet:') ? value : undefined, infoHash: isInfoHash(value) ? value : undefined }, mediaTitle: 'Reprodução P2P' } });
  }


  async function startSeeding() {
    if(!seedFile)return;
    setSeedBusy(true);setError('');
    try { const session=await seedLocalFile(seedFile,setSeedStats);setSeedSession(session);if(settings.analyticsOptIn)trackEvent('p2p_started',edition,{route:'/p2p',provider:'local-seed'}); }
    catch(reason){setError(reason instanceof Error?reason.message:'Não foi possível iniciar o compartilhamento P2P.');}
    finally{setSeedBusy(false);}
  }
  async function stopSeeding(){if(!seedSession)return;await seedSession.stop();setSeedSession(null);setSeedStats(null);}
  function openTorrentFile() {
    if (!selectedFile) { setError('Selecione um arquivo .torrent primeiro.'); return; }
    setError('');
    if (settings.analyticsOptIn) trackEvent('p2p_started', edition, { route: '/p2p', provider: 'torrent-file' });
    navigate('/watch', { state: { torrentFile: selectedFile, stream: { name: selectedFile.name, addonName: 'Arquivo .torrent local' }, mediaTitle: selectedFile.name } });
  }

  return (
    <div className="page-stack narrow-page p2p-page">
      <section className="page-intro">
        <span className="eyebrow">PEER-TO-PEER</span>
        <h2>Reprodução P2P</h2>
        <p>Abra arquivos torrent autorizados diretamente no navegador usando WebTorrent e conexões WebRTC.</p>
      </section>

      {!supported && <div className="notice notice-warning"><AlertTriangle size={18} /><div><b>Este ambiente não está pronto para P2P</b><span>Use HTTPS (ou localhost), um navegador com WebRTC e Service Workers habilitados.</span></div></div>}

      <section className="panel p2p-panel">
        <div className="panel-heading"><div className="panel-icon accent-icon"><Network size={20} /></div><div><h3>Abrir magnet URI ou infoHash</h3><p>O navegador conecta diretamente a outros peers WebRTC compatíveis.</p></div></div>
        <form className="p2p-form" onSubmit={openMagnet}>
          <label htmlFor="p2p-identifier">Magnet URI / infoHash</label>
          <textarea id="p2p-identifier" rows={3} maxLength={4096} placeholder="magnet:?xt=urn:btih:… ou infoHash" value={identifier} onChange={(event) => setIdentifier(event.target.value)} />
          <button className="button-primary" type="submit" disabled={!supported || !identifier.trim()}><Play size={16} fill="currentColor" /> Abrir no player</button>
        </form>
        <div className="p2p-divider"><span>ou</span></div>
        <div className="p2p-file-picker">
          <div><b>Arquivo .torrent</b><span>Selecione um arquivo torrent salvo no seu dispositivo.</span></div>
          <input ref={fileRef} type="file" accept=".torrent,application/x-bittorrent" onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)} />
          <button className="button-secondary" type="button" disabled={!supported || !selectedFile} onClick={openTorrentFile}><FileUp size={16} /> {selectedFile ? 'Abrir arquivo' : 'Selecione um arquivo'}</button>
          {selectedFile && <small className="muted-url">{selectedFile.name} · {(selectedFile.size / 1024).toFixed(1)} KB</small>}
        </div>
        {error && <div className="inline-message error"><AlertTriangle size={16} />{error}</div>}
      </section>

      <section className="panel p2p-panel"><div className="panel-heading"><div className="panel-icon accent-icon"><Upload size={20}/></div><div><h3>Compartilhar arquivo (seed WebRTC)</h3><p>Transforme um arquivo seu em uma fonte P2P WebTorrent para outros navegadores compatíveis.</p></div></div><label className="file-drop"><Upload size={18}/><span>{seedFile?seedFile.name:'Selecionar arquivo local para compartilhar'}<input type="file" onChange={event=>setSeedFile(event.target.files?.[0]??null)}/></span></label>{!seedSession?<button className="button-primary full-button" disabled={!supported||!seedFile||seedBusy} onClick={()=>void startSeeding()}>{seedBusy?'Preparando seed…':'Começar a compartilhar'}</button>:<><div className="p2p-seed-stats"><b>{seedSession.fileName}</b><span>{seedStats?.peers??0} peer(s) · enviado {formatP2PBytes(seedStats?.uploaded??0)} · {formatP2PSpeed(seedStats?.uploadSpeed??0)}</span><textarea readOnly rows={3} value={seedSession.magnetURI}/><div className="sync-action-grid"><button className="button-secondary" onClick={()=>void navigator.clipboard?.writeText(seedSession.magnetURI)}><Copy size={15}/> Copiar magnet</button><button className="button-secondary danger-text" onClick={()=>void stopSeeding()}><Square size={15}/> Parar compartilhamento</button></div></div></>}</section>

      <section className="panel p2p-explainer">
        <div className="panel-heading"><div className="panel-icon"><Zap size={20} /></div><div><h3>O que o P2P Web faz</h3><p>Sem servidor intermediário de vídeo.</p></div></div>
        <div className="feature-status"><ShieldCheck size={16} /><div><b>Conexão direta entre navegadores</b><span>O WebTorrent pode receber e também compartilhar arquivos selecionados pelo usuário via WebRTC; a API Render não retransmite o arquivo.</span></div></div>
        <div className="feature-status"><Info size={16} /><div><b>Compatibilidade da rede</b><span>O magnet precisa incluir um tracker WebSocket ou usar um tracker configurado. A swarm também precisa de peers que falem WebTorrent/WebRTC.</span></div></div>
        <div className="notice notice-warning"><AlertTriangle size={18} /><div><b>Limite importante</b><span>O navegador não conecta diretamente a todos os peers BitTorrent comuns via TCP/UDP. O seed permanece ativo enquanto esta aba e a sessão WebRTC continuarem abertas; não existe seed em segundo plano confiável no mobile. Trackers e peers podem observar o infoHash e metadados da conexão, incluindo seu endereço de rede público. Use somente arquivos próprios, de domínio público ou que você tenha autorização para compartilhar.</span></div></div>
      </section>
    </div>
  );
}
