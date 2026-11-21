import type { MediaItem } from '../types';
export function mediaKey(item: MediaItem): string { return `${item.media_type ?? 'movie'}:${item.id}`; }
export function displayTitle(item: MediaItem): string { return item.title ?? item.name ?? 'Sem título'; }
export function yearOf(item: MediaItem): string { return (item.release_date ?? item.first_air_date ?? '').slice(0, 4); }
