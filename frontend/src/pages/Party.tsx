import { useEffect, useRef, useState } from 'react';
import { MessageCircle, Users, Link2, Radio, Send, Copy, LogOut } from 'lucide-react';
import { api } from '../lib/api';
import { connectParty, disconnectParty, subscribeParty, sendPartyMessage, type PartyEvent } from '../features/party';

type ChatMessage = { id: string; name: string; text: string; at: number };

export default function Party() {
  const [name, setName] = useState('Convidado');
  const [codeInput, setCodeInput] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [status, setStatus] = useState('Desconectado');
  const [members, setMembers] = useState<Array<{ id: string; name: string }>>([]);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [message, setMessage] = useState('');
  const socketRef = useRef<{ close: () => void } | null>(null);
  const messagesRef = useRef<HTMLDivElement>(null);

  function connect(code: string) {
    setStatus('Conectando…'); setRoomCode(code);
    const unsubscribe = subscribeParty((data: PartyEvent) => {
      if (data.type === 'welcome' && Array.isArray(data.members)) { setMembers(data.members as Array<{id:string;name:string}>); setStatus('Conectado'); }
      if (data.type === 'presence' && data.member && typeof data.member === 'object') {
        const raw = data.member as Record<string, unknown>;
        const member = { id: String(raw.id ?? '').slice(0, 80), name: String(raw.name ?? 'Convidado').slice(0, 32) };
        if (!member.id) return;
        setMembers((current) => data.event === 'leave' ? current.filter((entry) => entry.id !== member.id) : [...current.filter((entry) => entry.id !== member.id), member]);
      }
      if (data.type === 'chat') setChat((current) => [...current.slice(-99), { id: String(data.id), name: String(data.name), text: String(data.text), at: Number(data.at) }]);
      if (data.type === 'error') setStatus(String(data.message));
      if (data.type === 'connection' && data.state === 'error') setStatus('Falha na conexão com a sala.');
      if (data.type === 'connection' && data.state === 'closed') setStatus('Conexão encerrada.');
    });
    socketRef.current = { close: unsubscribe };
    try { connectParty(code, name); } catch (error) { unsubscribe(); socketRef.current = null; setRoomCode(''); setStatus(error instanceof Error ? error.message : 'Não foi possível conectar.'); }
  }

  useEffect(() => () => { const current = socketRef.current; current?.close(); }, []);
  useEffect(() => { messagesRef.current?.scrollTo({ top: messagesRef.current.scrollHeight, behavior: 'smooth' }); }, [chat]);

  async function createRoom() {
    try { const result = await api.createParty(name); connect(result.code); }
    catch (error) { setStatus(error instanceof Error ? error.message : 'Não foi possível criar a sala.'); }
  }
  async function joinRoom(event: React.FormEvent) {
    event.preventDefault();
    const code = codeInput.trim().toUpperCase();
    try { await api.checkParty(code); connect(code); }
    catch (error) { setStatus(error instanceof Error ? error.message : 'Sala não encontrada.'); }
  }
  function sendMessage(event: React.FormEvent) {
    event.preventDefault(); const text = message.trim().slice(0, 1200);
    if (!text || !roomCode) return;
    if (sendPartyMessage({ type: 'chat', text })) { setChat((current) => [...current.slice(-99), {id:'me',name:'Você',text,at:Date.now()}]); setMessage(''); } else setStatus('Reconectando à sala…');
  }
  function closeRoom() { const current = socketRef.current; current?.close(); socketRef.current = null; disconnectParty(); setRoomCode(''); setMembers([]); setChat([]); setStatus('Desconectado'); }

  return <div className="page-stack narrow-page"><section className="page-intro"><span className="eyebrow">ENHANCED · SOCIAL</span><h2>Watch Party</h2><p>Crie uma sala privada temporária, compartilhe o código e sincronize comandos de reprodução com amigos.</p></section>
    {!roomCode ? <section className="two-column-section"><div className="panel"><div className="panel-heading"><div className="panel-icon"><Users size={20}/></div><div><h3>Criar sala</h3><p>Até 12 participantes por sala.</p></div></div><label>Seu nome</label><input className="wide-input" maxLength={32} value={name} onChange={(e)=>setName(e.target.value)}/><button className="button-primary full-button" onClick={()=>void createRoom()} disabled={!name.trim()}><Users size={16}/> Criar Watch Party</button></div>
      <div className="panel"><div className="panel-heading"><div className="panel-icon"><Link2 size={20}/></div><div><h3>Entrar em sala</h3><p>Digite o código que recebeu.</p></div></div><form onSubmit={joinRoom}><label>Código da sala</label><input className="wide-input" maxLength={12} value={codeInput} onChange={(e)=>setCodeInput(e.target.value.toUpperCase())} placeholder="ABC1234" required/><button className="button-secondary full-button"><Link2 size={16}/> Entrar</button></form></div></section> : <section className="panel party-room"><div className="party-room-head"><div><span className="eyebrow">SALA ATIVA</span><h3>{roomCode}</h3><p><span className="status-dot"/> {status}</p></div><div className="party-head-actions"><button className="icon-button" onClick={()=>void navigator.clipboard?.writeText(roomCode)} title="Copiar código"><Copy size={16}/></button><button className="icon-button danger-button" onClick={closeRoom} title="Sair"><LogOut size={16}/></button></div></div>
        <div className="party-member-list">{members.map((member)=><span key={member.id}><Users size={13}/>{member.name}</span>)}</div>
        <div className="party-chat" ref={messagesRef}>{chat.map((entry,index)=><div className={`party-chat-line ${entry.id==='me'?'mine':''}`} key={`${entry.at}-${index}`}><b>{entry.name}</b><span>{entry.text}</span><small>{new Date(entry.at).toLocaleTimeString()}</small></div>)}</div>
        <form className="party-chat-form" onSubmit={sendMessage}><input value={message} onChange={(e)=>setMessage(e.target.value)} maxLength={1200} placeholder="Mensagem para a sala…"/><button className="button-primary" disabled={!message.trim()}><Send size={15}/></button></form>
      </section>}
    {status !== 'Desconectado' && !roomCode && <div className="notice notice-info"><Radio size={16}/><div><span>{status}</span></div></div>}
    <div className="notice notice-warning"><MessageCircle size={17}/><div><b>Estado inicial do Watch Party</b><span>As salas são temporárias e ficam na memória do processo da API; não há gravação do chat. A sincronização do player usa eventos de sala e precisa que os participantes tenham acesso à mesma fonte de mídia. Reiniciar a instância Render encerra as salas.</span></div></div>
  </div>;
}
