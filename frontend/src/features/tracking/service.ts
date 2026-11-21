import { api } from '../../lib/api';
import type { TrackingProvider } from '../../types';

export type DeviceTrackingProvider = 'trakt' | 'simkl';
export type TrackingDeviceCode = { deviceCode: string; userCode: string; verificationUrl: string; expiresIn: number; interval: number };
export type TraktDeviceToken = { accessToken: string; refreshToken: string; expiresIn: number; createdAt: number; scope?: string; tokenType?: string };
export type SimklDeviceToken = { accessToken: string; tokenType?: string; expiresIn?: number };
const key = (profileId: string, provider: string) => `nuvio-session:${profileId}:${provider}`;
export function readSessionCredential<T>(profileId: string, provider: TrackingProvider | 'media-server', fallback: T): T {
  try { const raw = sessionStorage.getItem(key(profileId, provider)); return raw ? JSON.parse(raw) as T : fallback; } catch { return fallback; }
}
export function writeSessionCredential(profileId: string, provider: string, value: unknown): void {
  try { sessionStorage.setItem(key(profileId, provider), JSON.stringify(value)); } catch { throw new Error('O navegador não permitiu guardar a credencial nesta sessão.'); }
}
export function removeSessionCredential(profileId: string, provider: string): void { try { sessionStorage.removeItem(key(profileId, provider)); } catch { /* Ignore unavailable session storage. */ } }
export async function startDeviceAuthorization(provider: DeviceTrackingProvider): Promise<TrackingDeviceCode> {
  return provider === 'trakt' ? api.traktDeviceCode() : api.simklDeviceCode();
}
export function completeDeviceAuthorization(provider: 'trakt', deviceCode: string): Promise<TraktDeviceToken>;
export function completeDeviceAuthorization(provider: 'simkl', deviceCode: string): Promise<SimklDeviceToken>;
export function completeDeviceAuthorization(provider: DeviceTrackingProvider, deviceCode: string): Promise<TraktDeviceToken | SimklDeviceToken> {
  return provider === 'trakt' ? api.traktDeviceToken(deviceCode) : api.simklDeviceToken(deviceCode);
}
export async function getWatchedItems(provider: DeviceTrackingProvider, accessToken: string): Promise<unknown> {
  if (!accessToken.trim()) throw new Error('Conecte sua conta antes de sincronizar.');
  return provider === 'trakt' ? api.traktWatched(accessToken) : api.simklWatched(accessToken);
}
export async function sendTraktScrobble(accessToken: string, payload: { action: 'start'|'pause'|'stop'; progress: number; movie?: Record<string, unknown>; episode?: Record<string, unknown>; show?: Record<string, unknown> }): Promise<Record<string, unknown>> {
  if (!accessToken.trim()) throw new Error('Token Trakt ausente.');
  return api.traktScrobble(accessToken, { ...payload, progress: Math.max(0, Math.min(100, payload.progress)) });
}
