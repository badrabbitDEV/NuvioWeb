import { partyWebSocketUrl } from '../../lib/api';

export type PartyMember = { id: string; name: string };
export type PartyEvent =
  | { type: 'welcome'; id: string; members: PartyMember[] }
  | { type: 'presence'; event: 'join'|'rename'|'leave'; member: PartyMember; count?: number }
  | { type: 'chat'; id: string; name: string; text: string; at: number }
  | { type: 'playback'; id: string; action: 'play'|'pause'|'seek'; currentTime: number; mediaKey?: string; at: number }
  | { type: 'error'; message: string }
  | { type: string; [key: string]: unknown };
type Listener = (event: PartyEvent) => void;
let socket: WebSocket | null = null;
let room = '';
let generation = 0;
const listeners = new Set<Listener>();
const dispatch = (event: PartyEvent) => { for (const listener of [...listeners]) { try { listener(event); } catch { /* A screen listener must not break other listeners. */ } } };

export function connectParty(roomCode: string, displayName: string): void {
  const normalized = roomCode.trim().toUpperCase();
  if (!/^[A-Z0-9_-]{5,12}$/.test(normalized)) throw new Error('Código de sala inválido.');
  if (!displayName.trim()) throw new Error('Informe um nome para a sala.');
  if (socket && room === normalized && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'hello', name: displayName.trim().slice(0, 32) }));
    return;
  }
  const currentGeneration = ++generation;
  socket?.close(1000, 'Changing room');
  room = normalized;
  const next = new WebSocket(partyWebSocketUrl(`/ws/party/${normalized}`));
  socket = next;
  next.addEventListener('open', () => {
    if (generation !== currentGeneration || socket !== next) return;
    next.send(JSON.stringify({ type: 'hello', name: displayName.trim().slice(0, 32) }));
    dispatch({ type: 'connection', state: 'connected' });
  });
  next.addEventListener('error', () => { if (generation === currentGeneration) dispatch({ type: 'connection', state: 'error' }); });
  next.addEventListener('close', event => {
    if (generation !== currentGeneration) return;
    socket = null; room = '';
    dispatch({ type: 'connection', state: 'closed', code: event.code, reason: event.reason });
  });
  next.addEventListener('message', event => {
    if (generation !== currentGeneration) return;
    try { const parsed: unknown = JSON.parse(String(event.data)); if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) dispatch(parsed as PartyEvent); }
    catch { dispatch({ type: 'error', message: 'A sala enviou uma mensagem inválida.' }); }
  });
  dispatch({ type: 'connection', state: 'connecting' });
}

export function sendPartyMessage(message: Record<string, unknown>): boolean {
  if (!socket || socket.readyState !== WebSocket.OPEN) return false;
  try {
    const type = message.type;
    if (type === 'chat') {
      const text = typeof message.text === 'string' ? message.text.trim().slice(0, 1200) : '';
      if (!text) return false;
      socket.send(JSON.stringify({ type: 'chat', text }));
    } else if (type === 'playback') {
      const action = message.action;
      const currentTime = Number(message.currentTime);
      if (!['play','pause','seek'].includes(String(action)) || !Number.isFinite(currentTime) || currentTime < 0 || currentTime > 86400) return false;
      socket.send(JSON.stringify({ type: 'playback', action, currentTime, mediaKey: typeof message.mediaKey === 'string' ? message.mediaKey.slice(0, 180) : '' }));
    } else if (type === 'ping') socket.send('{"type":"ping"}');
    else return false;
    return true;
  } catch { return false; }
}
export function subscribeParty(listener: Listener): () => void { listeners.add(listener); return () => listeners.delete(listener); }
export function disconnectParty(): void { generation += 1; const current = socket; socket = null; room = ''; current?.close(1000, 'User left room'); }
export function activePartyRoom(): string { return room; }
