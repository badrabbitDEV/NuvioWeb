import type { MediaItem, WatchProgress } from '../types';
import { idbGetAll, idbPut } from './storage';

export async function saveWatchProgress(input: { mediaKey: string; profileId?: string; item?: MediaItem; position: number; duration: number; season?: number; episode?: number }): Promise<void> {
  if (!Number.isFinite(input.position) || !Number.isFinite(input.duration) || input.duration <= 0) return;
  const entry: WatchProgress = {
    mediaKey: `${input.profileId ?? 'main'}:${input.mediaKey}`,
    item: input.item ?? { id: Math.abs(hashCode(input.mediaKey)), title: input.mediaKey, media_type: 'movie' },
    position: Math.max(0, input.position),
    duration: Math.max(0, input.duration),
    completed: input.position >= input.duration - 45,
    updatedAt: Date.now(),
    season: input.season,
    episode: input.episode,
  };
  try { await idbPut('watch-progress', entry); } catch {
    try { localStorage.setItem(`nuvio-web:progress:${input.profileId ?? 'main'}:${input.mediaKey}`, JSON.stringify({ currentTime: entry.position, duration: entry.duration, updatedAt: entry.updatedAt, item: entry.item, mediaKey: entry.mediaKey })); } catch { /* Persistent progress is optional. */ }
  }
}

export async function listWatchProgress(profileId = 'main'): Promise<WatchProgress[]> {
  try {
    return (await idbGetAll<WatchProgress>('watch-progress')).filter((entry) => entry.mediaKey.startsWith(`${profileId}:`) && !entry.completed && entry.duration > 0 && entry.position > 0).sort((a,b) => b.updatedAt-a.updatedAt);
  } catch {
    const entries: WatchProgress[] = [];
    for (let index=0; index<localStorage.length; index++) {
      const key = localStorage.key(index);
      if (!key?.startsWith(`nuvio-web:progress:${profileId}:`)) continue;
      try {
        const value = JSON.parse(localStorage.getItem(key) ?? 'null') as { currentTime?: number; duration?: number; updatedAt?: number; item?: MediaItem; mediaKey?: string } | null;
        if (value?.currentTime && value.duration && value.item && value.mediaKey && value.currentTime < value.duration-45) entries.push({ mediaKey:value.mediaKey,item:value.item,position:value.currentTime,duration:value.duration,completed:false,updatedAt:value.updatedAt??0 });
      } catch { /* Skip malformed local records. */ }
    }
    return entries.sort((a,b)=>b.updatedAt-a.updatedAt);
  }
}

function hashCode(value:string):number{let hash=0;for(let i=0;i<value.length;i++)hash=((hash<<5)-hash)+value.charCodeAt(i)|0;return hash;}
