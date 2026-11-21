import type { Profile, WatchProgress, DownloadRecord } from '../../types';
import { idbDelete, idbGetAll } from '../../lib/storage';

const PIN_ITERATIONS = 210_000;
const toHex = (bytes: Uint8Array): string => Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
const fromHex = (value: string): Uint8Array => {
  if (!/^(?:[a-f0-9]{2})+$/i.test(value)) throw new Error('Hash de PIN inválido.');
  return new Uint8Array(value.match(/.{2}/g)!.map(part => Number.parseInt(part, 16)));
};

async function derivePin(pin: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, material, 256);
  return new Uint8Array(bits);
}

export async function hashProfilePin(pin: string): Promise<string> {
  const value = pin.trim();
  if (!/^\d{4,8}$/.test(value)) throw new Error('O PIN deve conter de 4 a 8 números.');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derivePin(value, salt, PIN_ITERATIONS);
  return `pbkdf2-sha256$${PIN_ITERATIONS}$${toHex(salt)}$${toHex(hash)}`;
}
export async function verifyProfilePin(pin: string, expectedHash: string): Promise<boolean> {
  const value = pin.trim();
  if (!/^\d{4,8}$/.test(value) || !expectedHash) return false;
  try {
    const parts = expectedHash.split('$');
    if (parts.length === 4 && parts[0] === 'pbkdf2-sha256') {
      const iterations = Number(parts[1]);
      if (!Number.isSafeInteger(iterations) || iterations < 100_000 || iterations > 1_000_000) return false;
      const expected = fromHex(parts[3]);
      const actual = await derivePin(value, fromHex(parts[2]), iterations);
      return expected.length === actual.length && expected.every((byte, index) => byte === actual[index]);
    }
    // Backward compatibility for profiles created with the previous SHA-256-only format.
    const legacy = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`nuvio-profile-pin:${value}`));
    return toHex(new Uint8Array(legacy)) === expectedHash;
  } catch { return false; }
}
export async function makeProfile(input: { name: string; avatar: string; isKids: boolean; pin?: string; id?: string; now?: number }): Promise<Profile> {
  const name = input.name.trim().replace(/\s+/g, ' ').slice(0, 32);
  if (!name) throw new Error('Informe o nome do perfil.');
  const pinHash = input.pin?.trim() ? await hashProfilePin(input.pin) : undefined;
  return { id: input.id ?? crypto.randomUUID(), name, avatar: input.avatar, color: '#8b7cff', isKids: input.isKids, pinHash, createdAt: input.now ?? Date.now() };
}
export async function deleteProfileLocalData(profileId: string): Promise<void> {
  if (!/^[a-z0-9_-]{1,80}$/i.test(profileId)) throw new Error('Identificador de perfil inválido.');
  const prefix = `nuvio-web:${profileId}:`;
  for (let index = localStorage.length - 1; index >= 0; index--) {
    const key = localStorage.key(index);
    if (key?.startsWith(prefix)) localStorage.removeItem(key);
  }
  const [progress, downloads] = await Promise.all([
    idbGetAll<WatchProgress>('watch-progress').catch(() => []),
    idbGetAll<DownloadRecord>('downloads').catch(() => []),
  ]);
  await Promise.all([
    ...progress.filter(entry => entry.mediaKey.startsWith(`${profileId}:`)).map(entry => idbDelete('watch-progress', entry.mediaKey)),
    ...downloads.filter(entry => entry.profileId === profileId).map(entry => idbDelete('downloads', entry.id)),
  ]);
}
export function profileCanBeDeleted(profiles: Profile[]): boolean { return profiles.length > 1; }
