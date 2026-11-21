import type { Stream, UserSettings } from '../types';

export type StreamMetadata = {
  resolution: number;
  size?: number;
  codec?: 'av1'|'hevc'|'h264'|'vp9'|'unknown';
  hdr: boolean;
  dolbyVision: boolean;
  audio: string[];
  source?: string;
  isCam: boolean;
  browserReady: boolean;
  p2p: boolean;
  seeds?: number;
};
export type StreamScore = { score:number; reasons:string[]; metadata:StreamMetadata; resolution:number; size?:number; audioMatch:boolean; browserReady:boolean };

function textOf(stream:Stream):string{
  return `${stream.name??''} ${stream.title??''} ${stream.description??''} ${stream.behaviorHints?.filename??''} ${(stream.audio??[]).join(' ')} ${stream.language??''}`.toLowerCase();
}
function resolutionOf(text:string):number{
  const direct=text.match(/(?:^|\D)(4320|2160|1440|1080|720|576|540|480|360)\s*p?(?:\D|$)/);
  if(direct)return Number(direct[1]);
  if(/\b(8k|uhd2)\b/.test(text))return 4320;
  if(/\b(4k|uhd)\b/.test(text))return 2160;
  return 0;
}
function browserReady(stream:Stream):boolean{
  if(stream.behaviorHints?.notWebReady)return false;
  const url=String(stream.url??stream.externalUrl??'').trim();
  if(url.startsWith('magnet:?')||Boolean(stream.infoHash))return true;
  try{const parsed=new URL(url);return parsed.protocol==='https:';}catch{return false;}
}
export function inspectStream(stream:Stream):StreamMetadata{
  const text=textOf(stream);
  const resolution=resolutionOf(text);
  const codec:StreamMetadata['codec'] = /\b(av1)\b/.test(text)?'av1':/\b(hevc|h\.265|h265|x265)\b/.test(text)?'hevc':/\b(vp9)\b/.test(text)?'vp9':/\b(h\.264|h264|x264|avc)\b/.test(text)?'h264':'unknown';
  const audio=[...new Set([...(stream.audio??[]).map(value=>String(value).toLowerCase()),String(stream.language??'').toLowerCase()].filter(Boolean))];
  const size=typeof stream.size==='number'&&Number.isFinite(stream.size)&&stream.size>0?stream.size:undefined;
  const source=/\b(remux)\b/.test(text)?'Remux':/blu.?ray|bdrip/.test(text)?'Blu-ray':/web.?dl/.test(text)?'WEB-DL':/web.?rip/.test(text)?'WEB-Rip':/hdtv/.test(text)?'HDTV':undefined;
  const isCam=/\b(cam|hdcam|telesync|telesyn|hdts|tsrip|telescreener)\b/.test(text);
  const p2p=Boolean(stream.infoHash)||String(stream.url??'').startsWith('magnet:');
  const peers=Number(stream.seeds??stream.seeders??stream.behaviorHints?.seeders);
  return {resolution,size,codec,hdr:/\bhdr(10\+?)?\b|hlg/.test(text),dolbyVision:/dolby[ ._-]?vision|\bdv\b/.test(text),audio,source,isCam,browserReady:browserReady(stream),p2p,seeds:Number.isFinite(peers)?peers:undefined};
}

function codecCanPlay(codec:StreamMetadata['codec']):boolean{
  if(typeof document==='undefined')return true;
  const video=document.createElement('video');
  if(codec==='av1')return Boolean(video.canPlayType('video/mp4; codecs="av01.0.05M.08"'));
  if(codec==='hevc')return Boolean(video.canPlayType('video/mp4; codecs="hvc1.1.6.L93.B0"'));
  if(codec==='vp9')return Boolean(video.canPlayType('video/webm; codecs="vp09.00.10.08"'));
  if(codec==='h264')return Boolean(video.canPlayType('video/mp4; codecs="avc1.42E01E"'));
  return true;
}

export function scoreStream(stream:Stream,settings:UserSettings):StreamScore{
  const metadata=inspectStream(stream);const reasons:string[]=[];let score=metadata.browserReady?120:-1000;
  if(metadata.browserReady)reasons.push(metadata.p2p?'P2P WebRTC possível':'URL HTTPS');
  if(metadata.resolution){score+=Math.min(metadata.resolution,2160)/22;reasons.push(`${metadata.resolution}p`);}
  if(metadata.codec!=='unknown'){if(codecCanPlay(metadata.codec)){score+=metadata.codec==='h264'?8:metadata.codec==='av1'?7:metadata.codec==='vp9'?6:2;reasons.push(`${metadata.codec.toUpperCase()} compatível`);}else{score-=35;reasons.push(`${metadata.codec.toUpperCase()} pode não ser suportado`);}}
  if(metadata.hdr){score+=4;reasons.push(metadata.dolbyVision?'Dolby Vision':'HDR');}
  if(metadata.source==='Remux'){score+=8;reasons.push('Remux');}else if(metadata.source==='Blu-ray'){score+=6;reasons.push('Blu-ray');}else if(metadata.source==='WEB-DL'){score+=5;reasons.push('WEB-DL');}
  if(metadata.isCam){score-=600;reasons.push('CAM/TS');}
  if(metadata.p2p){score+=3;reasons.push('peer-to-peer');}
  if(metadata.seeds!==undefined){score+=Math.min(metadata.seeds,50)/5;reasons.push(`${metadata.seeds} seed(s)`);}
  const preferred=settings.preferredAudio.toLowerCase();
  const audioMatch=preferred==='auto'||metadata.audio.some(value=>value.includes(preferred)||(preferred==='pt-br'&&(value.includes('pt')||value.includes('portugu'))));
  if(audioMatch&&preferred!=='auto'){score+=18;reasons.push(`áudio ${preferred}`);}else if(preferred!=='auto'&&metadata.audio.length){score-=12;}
  if(metadata.size!==undefined){if(settings.streamSort==='smallest')score+=100_000/Math.max(metadata.size,1);if(settings.streamSort==='largest')score+=Math.min(metadata.size/1_000_000,120);}
  return {score,reasons,metadata,resolution:metadata.resolution,size:metadata.size,audioMatch,browserReady:metadata.browserReady};
}
export function rankStreams(streams:Stream[],settings:UserSettings):Stream[]{
  if(settings.streamSort==='addon')return streams;
  const enriched=streams.map((stream,index)=>({stream,index,score:scoreStream(stream,settings)}));
  enriched.sort((a,b)=>{
    if(settings.streamSort==='quality')return b.score.resolution-a.score.resolution||b.score.score-a.score.score||a.index-b.index;
    if(settings.streamSort==='smallest')return (a.score.size??Infinity)-(b.score.size??Infinity)||b.score.score-a.score.score||a.index-b.index;
    if(settings.streamSort==='largest')return (b.score.size??-1)-(a.score.size??-1)||b.score.score-a.score.score||a.index-b.index;
    return b.score.score-a.score.score||a.index-b.index;
  });
  return enriched.map(item=>item.stream);
}
