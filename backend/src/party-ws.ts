import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { isActivePartyCode } from './routes/party.js';
import { config } from './config.js';

type RoomClient = { ws: WebSocket; id: string; name: string; lastMessageAt: number };
type PartyMessage = { type: 'hello'; name?: string } | { type: 'chat'; text: string } | { type: 'playback'; action: 'play' | 'pause' | 'seek'; currentTime: number; mediaKey?: string } | { type: 'ping' };
const rooms = new Map<string, Map<string, RoomClient>>();
const maxRoomMembers = 12;
const maxMessageChars = 1200;

export function attachPartyWebSocket(server: Server): void {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 });
  server.on('upgrade', (request, socket, head) => {
    let url: URL;
    try { url = new URL(request.url ?? '/', 'http://localhost'); } catch { socket.destroy(); return; }
    const origin = request.headers.origin;
    const match = url.pathname.match(/^\/ws\/party\/([A-Z0-9_-]{5,12})$/i);
    if (!origin || !config.corsOrigins.includes(origin) || !match || !isActivePartyCode(match[1].toUpperCase())) { socket.destroy(); return; }
    wss.handleUpgrade(request, socket, head, (ws) => handleConnection(ws, match[1].toUpperCase()));
  });
}

function handleConnection(ws: WebSocket, roomCode: string): void {
    const room = rooms.get(roomCode) ?? new Map<string, RoomClient>();
    rooms.set(roomCode, room);
    if (room.size >= maxRoomMembers) { ws.close(1013, 'Room full'); return; }
    const id = randomUUID();
    const client: RoomClient = { ws, id, name: `Convidado-${room.size + 1}`, lastMessageAt: 0 };
    room.set(id, client);
    const send = (target: WebSocket, data: unknown) => { if (target.readyState === WebSocket.OPEN) target.send(JSON.stringify(data)); };
    const broadcast = (data: unknown, except?: string) => { for (const [peerId, peer] of room) if (peerId !== except) send(peer.ws, data); };
    send(ws, { type: 'welcome', id, members: [...room.values()].map(({ id: peerId, name }) => ({ id: peerId, name })) });
    broadcast({ type: 'presence', event: 'join', member: { id, name: client.name }, count: room.size }, id);
    ws.on('message', (raw) => {
      let data: PartyMessage;
      try { const parsed: unknown = JSON.parse(String(raw)); if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('invalid message'); data = parsed as PartyMessage; } catch { send(ws, { type: 'error', message: 'JSON inválido.' }); return; }
      const now = Date.now();
      if (now - client.lastMessageAt < 180) { send(ws, { type: 'error', message: 'Aguarde antes de enviar outra mensagem.' }); return; }
      client.lastMessageAt = now;
      if (data.type === 'hello') {
        const name = String(data.name ?? '').trim().slice(0, 32);
        if (name) client.name = name;
        broadcast({ type: 'presence', event: 'rename', member: { id, name: client.name } });
      } else if (data.type === 'chat') {
        const text = String(data.text ?? '').trim().slice(0, maxMessageChars);
        if (text) broadcast({ type: 'chat', id, name: client.name, text, at: now });
      } else if (data.type === 'playback') {
        const currentTime = Number(data.currentTime);
        if (!['play', 'pause', 'seek'].includes(data.action) || !Number.isFinite(currentTime) || currentTime < 0 || currentTime > 60 * 60 * 24) return;
        broadcast({ type: 'playback', id, action: data.action, currentTime, mediaKey: String(data.mediaKey ?? '').slice(0, 180), at: now }, id);
      } else if (data.type === 'ping') send(ws, { type: 'pong', at: now });
    });
    ws.on('close', () => {
      room.delete(id);
      broadcast({ type: 'presence', event: 'leave', member: { id, name: client.name }, count: room.size });
      if (!room.size) rooms.delete(roomCode);
    });
}
