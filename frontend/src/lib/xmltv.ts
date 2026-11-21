import type { EpgProgramme } from '../types';

function textContent(node: Element | null, selector: string): string | undefined {
  const value = node?.querySelector(selector)?.textContent?.trim();
  return value || undefined;
}

function parseXmltvDate(value: string | null): number | null {
  if (!value) return null;
  const match = value.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?\s*([+-]\d{4})?/);
  if (!match) return null;
  const [, y, mo, d, h, mi, s = '00', offset = '+0000'] = match;
  const isoOffset = `${offset.slice(0, 3)}:${offset.slice(3)}`;
  const timestamp = Date.parse(`${y}-${mo}-${d}T${h}:${mi}:${s}${isoOffset}`);
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function parseXmltv(xml: string): EpgProgramme[] {
  const document = new DOMParser().parseFromString(xml, 'application/xml');
  if (document.querySelector('parsererror')) throw new Error('O arquivo XMLTV contém XML inválido.');
  return Array.from(document.querySelectorAll('programme')).flatMap((node) => {
    const start = parseXmltvDate(node.getAttribute('start'));
    const stop = parseXmltvDate(node.getAttribute('stop'));
    const channelId = node.getAttribute('channel');
    const title = textContent(node, 'title');
    if (!start || !stop || stop <= start || !channelId || !title) return [];
    return [{ channelId, title, description: textContent(node, 'desc'), category: textContent(node, 'category'), start, stop }];
  }).sort((a, b) => a.start - b.start);
}
