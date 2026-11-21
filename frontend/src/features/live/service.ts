import type { EpgProgramme, LiveChannel } from '../../types';
import { parseM3U } from '../../lib/m3u';
import { parseXmltv } from '../../lib/xmltv';

export { parseM3U, parseXmltv };
export const MAX_XMLTV_FILE_BYTES = 20 * 1024 * 1024;
export const MAX_XMLTV_TEXT_BYTES = 100 * 1024 * 1024;

export async function readXmltvFile(file: File): Promise<string> {
  const gzip = /\.gz$/i.test(file.name) || file.type === 'application/gzip';
  if (gzip && file.size > MAX_XMLTV_FILE_BYTES) throw new Error('O XMLTV gzip excede 20 MB.');
  if (!gzip) {
    if (file.size > MAX_XMLTV_TEXT_BYTES) throw new Error('O XMLTV excede 100 MB.');
    return file.text();
  }
  if (typeof DecompressionStream === 'undefined') throw new Error('Este navegador não oferece descompactação gzip. Envie XMLTV sem compressão.');
  const reader = file.stream().pipeThrough(new DecompressionStream('gzip')).getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      total += part.value.byteLength;
      if (total > MAX_XMLTV_TEXT_BYTES) throw new Error('O XMLTV descompactado excede 100 MB.');
      chunks.push(part.value);
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally { reader.releaseLock(); }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder('utf-8').decode(merged);
}
export function getChannelGroups(channels: LiveChannel[]): string[] {
  return ['Todos', ...Array.from(new Set(channels.map(channel => channel.group?.trim() || 'Sem categoria'))).sort((a, b) => a.localeCompare(b, 'pt-BR'))];
}
export function filterChannels(channels: LiveChannel[], query: string, group: string): LiveChannel[] {
  const needle = query.trim().toLocaleLowerCase('pt-BR');
  return channels.filter(channel => (group === 'Todos' || (channel.group || 'Sem categoria') === group) && (!needle || `${channel.name} ${channel.group ?? ''}`.toLocaleLowerCase('pt-BR').includes(needle)));
}
export function currentProgramme(epg: EpgProgramme[], channelId: string, now = Date.now()): EpgProgramme | undefined {
  return epg.find(programme => programme.channelId === channelId && programme.start <= now && programme.stop > now);
}
export function programmesForChannel(epg: EpgProgramme[], channelId: string, limit = 24): EpgProgramme[] {
  return epg.filter(programme => programme.channelId === channelId).sort((a, b) => a.start - b.start).slice(0, Math.max(0, Math.min(100, limit)));
}
export function validatePlayableChannelUrl(raw: string): string {
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error('URL do canal inválida.'); }
  if (url.protocol !== 'https:') throw new Error('O player web exige uma URL HTTPS para este canal.');
  return url.toString();
}
