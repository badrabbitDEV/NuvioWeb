import type { Edition } from '../types';

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000/api/v1').replace(/\/$/, '');

function sessionId(): string {
  const key = 'nuvio-web:analytics-session';
  let value = sessionStorage.getItem(key);
  if (!value) {
    value = typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = crypto.getRandomValues(new Uint8Array(1))[0] & 15;
        return (c === 'x' ? r : (r & 3) | 8).toString(16);
      });
    sessionStorage.setItem(key, value);
  }
  return value;
}

export type AnalyticsEventName = 'page_view' | 'addon_installed' | 'addon_removed' | 'player_started' | 'p2p_started' | 'live_tv_opened' | 'search_used' | 'edition_changed' | 'account_created';

export function trackEvent(
  name: AnalyticsEventName,
  edition: Edition,
  details: { route?: string; mediaType?: 'movie'|'tv'|'series'|'channel'|'other'; provider?: string } = {},
): void {
  try {
    const body = {
      sessionId: sessionId(), name, edition,
      ...(details.route ? { route: details.route } : {}),
      ...(details.mediaType ? { mediaType: details.mediaType } : {}),
      ...(details.provider ? { provider: details.provider.slice(0, 32) } : {}),
    };
    void fetch(`${API_BASE}/analytics/event`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      keepalive: true,
    }).catch(() => undefined);
  } catch { /* Telemetry is best-effort and must not affect app features. */ }
}
