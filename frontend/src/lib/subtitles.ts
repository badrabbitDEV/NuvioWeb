function timeToSeconds(value: string): number {
  const normalized = value.replace(',', '.').trim();
  const parts = normalized.split(':');
  const seconds = Number(parts.pop() ?? 0);
  const minutes = Number(parts.pop() ?? 0);
  const hours = Number(parts.pop() ?? 0);
  return hours * 3600 + minutes * 60 + seconds;
}
function secondsToVtt(value: number): string {
  const safe = Math.max(0, value);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = Math.floor(safe % 60);
  const ms = Math.round((safe - Math.floor(safe)) * 1000);
  return `${String(hours).padStart(2,'0')}:${String(minutes).padStart(2,'0')}:${String(seconds).padStart(2,'0')}.${String(ms).padStart(3,'0')}`;
}
export function srtToVtt(source: string, offsetSeconds = 0): string {
  const blocks = source.replace(/^\uFEFF/, '').replace(/\r/g, '').trim().split(/\n\s*\n/);
  const cues: string[] = [];
  for (const block of blocks) {
    const lines = block.split('\n');
    const timeIndex = lines.findIndex(line => line.includes('-->'));
    if (timeIndex < 0) continue;
    const parts = lines[timeIndex].split('-->');
    if (parts.length !== 2) continue;
    const left = timeToSeconds(parts[0]) + offsetSeconds;
    const right = timeToSeconds(parts[1].trim().split(/\s+/)[0]) + offsetSeconds;
    if (!Number.isFinite(left) || !Number.isFinite(right) || right <= left) continue;
    const cueText = lines.slice(timeIndex + 1).join('\n').trim();
    cues.push(`${secondsToVtt(left)} --> ${secondsToVtt(right)}\n${cueText}`);
  }
  return `WEBVTT\n\n${cues.join('\n\n')}`;
}
function shiftVtt(source:string,offsetSeconds:number):string {
  if(!offsetSeconds)return source;
  return source.split(/\r?\n/).map(line=>{const match=line.match(/^(\s*)(\d{2}:\d{2}:\d{2}\.\d{3})\s+-->\s+(\d{2}:\d{2}:\d{2}\.\d{3})(.*)$/);if(!match)return line;const toSeconds=(v:string)=>{const [h,m,s]=v.split(':');return Number(h)*3600+Number(m)*60+Number(s);};const toTime=(v:number)=>{const t=Math.max(0,v);const h=Math.floor(t/3600),m=Math.floor(t%3600/60),s=Math.floor(t%60),ms=Math.round((t-Math.floor(t))*1000);return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}.${String(ms).padStart(3,'0')}`;};return `${match[1]}${toTime(toSeconds(match[2])+offsetSeconds)} --> ${toTime(toSeconds(match[3])+offsetSeconds)}${match[4]}`;}).join('\n');
}

export async function resolveSubtitleUrl(url: string, label: string, offsetSeconds = 0, mimeType?: string): Promise<{ src: string; revoke: () => void }> {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:') throw new Error('Legendas externas precisam usar HTTPS.');
  const isSrt = /\.srt(?:$|\?)/i.test(parsed.pathname + parsed.search) || /subrip|x-subrip/i.test(mimeType ?? '');
  const isVtt = /\.vtt(?:$|\?)/i.test(parsed.pathname + parsed.search) || /vtt/i.test(mimeType ?? '');
  // Browsers do not render SRT as a native <track>; convert it even when no offset is applied.
  if (isSrt || (isVtt && offsetSeconds !== 0)) {
    const response = await fetch(parsed.toString(), { signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error(`Legenda respondeu HTTP ${response.status}.`);
    const source = await response.text();
    const vtt = isSrt ? srtToVtt(source, offsetSeconds) : shiftVtt(source, offsetSeconds);
    const blobUrl = URL.createObjectURL(new Blob([vtt], { type: 'text/vtt;charset=utf-8' }));
    return { src: blobUrl, revoke: () => URL.revokeObjectURL(blobUrl) };
  }
  return { src: url, revoke: () => undefined };
}
