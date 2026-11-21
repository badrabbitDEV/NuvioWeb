import type { LiveChannel } from '../types';

function parseAttributes(line: string): Record<string, string> {
  const result: Record<string, string> = {};
  const regex = /([\w-]+)="([^"]*)"/g;
  for (const match of line.matchAll(regex)) result[match[1].toLowerCase()] = match[2];
  return result;
}

export function parseM3U(text: string): LiveChannel[] {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines[0]?.startsWith('#EXTM3U')) throw new Error('Arquivo inválido: cabeçalho #EXTM3U não encontrado.');
  const channels: LiveChannel[] = [];
  let pending: { name: string; attrs: Record<string, string> } | null = null;
  for (const line of lines.slice(1)) {
    if (line.startsWith('#EXTINF:')) {
      const comma = line.indexOf(',');
      const attrs = parseAttributes(line);
      pending = { name: comma >= 0 ? line.slice(comma + 1).trim() : (attrs['tvg-name'] ?? 'Canal'), attrs };
    } else if (!line.startsWith('#') && pending) {
      let url: URL;
      try { url = new URL(line); } catch { pending = null; continue; }
      if (!['https:', 'http:'].includes(url.protocol)) { pending = null; continue; }
      const attrs = pending.attrs;
      const name = attrs['tvg-name'] || pending.name || 'Canal';
      const id = attrs['tvg-id'] || `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${channels.length}`;
      channels.push({ id, name, url: url.toString(), logo: attrs['tvg-logo'], group: attrs['group-title'] || 'Sem categoria', tvgId: attrs['tvg-id'], tvgName: attrs['tvg-name'], language: attrs['tvg-language'] });
      pending = null;
    }
  }
  return channels;
}
