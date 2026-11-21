import type { DownloadRecord } from '../../types';
import { idbDelete, idbGetAll, idbPut } from '../../lib/storage';

export const MAX_DOWNLOAD_BYTES = 500 * 1024 * 1024;
export const formatBytes = (value: number): string => value < 1024 * 1024 ? `${(value / 1024).toFixed(0)} KB` : `${(value / 1024 / 1024).toFixed(1)} MB`;

export function validateDownloadUrl(raw: string): URL {
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error('Informe uma URL válida.'); }
  if (url.protocol !== 'https:') throw new Error('Somente URLs HTTPS são aceitas.');
  if (url.username || url.password) throw new Error('URLs com usuário ou senha embutidos não são aceitas.');
  return url;
}

export async function downloadRemoteFile(input: {
  url: string; title?: string; profileId: string; signal?: AbortSignal; onProgress?: (percent: number) => void;
}): Promise<DownloadRecord> {
  const parsed = validateDownloadUrl(input.url);
  const response = await fetch(parsed.toString(), { signal: input.signal ?? AbortSignal.timeout(120_000), redirect: 'follow' });
  if (!response.ok) throw new Error(`Fonte respondeu HTTP ${response.status}.`);
  if (response.url) validateDownloadUrl(response.url);
  const declared = Number(response.headers.get('content-length') ?? 0);
  if (declared > MAX_DOWNLOAD_BYTES) throw new Error('O arquivo excede o limite de 500 MB desta interface.');
  if (!response.body) throw new Error('A fonte não permite baixar o arquivo.');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      received += part.value.byteLength;
      if (received > MAX_DOWNLOAD_BYTES) throw new Error('O arquivo excedeu 500 MB.');
      chunks.push(part.value);
      input.onProgress?.(declared > 0 ? Math.min(99, received / declared * 100) : 0);
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally { reader.releaseLock(); }
  const blob = new Blob(chunks, { type: response.headers.get('content-type') ?? 'application/octet-stream' });
  const record: DownloadRecord = {
    id: crypto.randomUUID(), title: input.title?.trim().slice(0, 160) || parsed.pathname.split('/').pop() || 'Arquivo offline',
    url: parsed.toString(), mimeType: blob.type, size: blob.size, createdAt: Date.now(), profileId: input.profileId, blob,
  };
  await idbPut('downloads', record);
  input.onProgress?.(100);
  return record;
}

export async function listDownloads(profileId: string): Promise<DownloadRecord[]> {
  return (await idbGetAll<DownloadRecord>('downloads')).filter(item => !item.profileId || item.profileId === profileId).sort((a, b) => b.createdAt - a.createdAt);
}
export async function removeDownload(id: string): Promise<void> { await idbDelete('downloads', id); }
export function createOfflineObjectUrl(record: DownloadRecord): string {
  if (!record.blob) throw new Error('Este registro não contém o arquivo offline.');
  return URL.createObjectURL(record.blob);
}
export async function estimateStorage(): Promise<{ usage?: number; quota?: number }> {
  if (!navigator.storage?.estimate) return {};
  const result = await navigator.storage.estimate();
  return { usage: result.usage, quota: result.quota };
}
