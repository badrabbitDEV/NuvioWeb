import type { MediaItem } from '../../types';

export type Collection = { id: string; name: string; mediaKeys: string[]; createdAt: number };
export const mediaKeyOf = (item: Pick<MediaItem, 'id' | 'media_type'>): string => `${item.media_type ?? 'movie'}:${item.id}`;
export const collectionStorageKey = (profileId: string): string => `nuvio-web:${profileId}:collections`;

export function normalizeCollections(value: unknown): Collection[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry): Collection[] => {
    if (!entry || typeof entry !== 'object') return [];
    const row = entry as Record<string, unknown>;
    const id = typeof row.id === 'string' ? row.id.slice(0, 80) : '';
    const name = typeof row.name === 'string' ? row.name.trim().slice(0, 40) : '';
    const mediaKeys = Array.isArray(row.mediaKeys) ? [...new Set(row.mediaKeys.filter((key): key is string => typeof key === 'string' && key.length <= 180))] : [];
    if (!id || !name) return [];
    return [{ id, name, mediaKeys, createdAt: Number.isFinite(Number(row.createdAt)) ? Number(row.createdAt) : Date.now() }];
  });
}

export function createCollection(name: string, id = crypto.randomUUID(), now = Date.now()): Collection {
  const clean = name.trim().replace(/\s+/g, ' ').slice(0, 40);
  if (!clean) throw new Error('Digite um nome para a coleção.');
  return { id, name: clean, mediaKeys: [], createdAt: now };
}

export function toggleCollectionItem(collection: Collection, mediaKey: string): Collection {
  const exists = collection.mediaKeys.includes(mediaKey);
  return { ...collection, mediaKeys: exists ? collection.mediaKeys.filter(key => key !== mediaKey) : [...collection.mediaKeys, mediaKey] };
}

export function addItemsToCollection(collection: Collection, mediaKeys: string[]): Collection {
  return { ...collection, mediaKeys: [...new Set([...collection.mediaKeys, ...mediaKeys])] };
}

export function mergeUniqueMedia<T extends MediaItem>(current: T[], incoming: T[]): T[] {
  const keys = new Set(current.map(mediaKeyOf));
  return [...current, ...incoming.filter(item => !keys.has(mediaKeyOf(item)) && (keys.add(mediaKeyOf(item)), true))];
}
