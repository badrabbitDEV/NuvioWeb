export type AppNotification = { id: string; title: string; body: string; createdAt: number; read: boolean; tag?: string };
const STORAGE_KEY = 'nuvio-web:notifications:v1';
const MAX_NOTIFICATIONS = 80;

export function notificationPermission(): NotificationPermission | 'unsupported' {
  return typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'unsupported';
}
export async function requestNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return Notification.requestPermission();
}
export function readNotifications(): AppNotification[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item): AppNotification[] => {
      if (!item || typeof item !== 'object') return [];
      const row = item as Record<string, unknown>;
      if (typeof row.id !== 'string' || typeof row.title !== 'string' || typeof row.body !== 'string') return [];
      return [{
        id: row.id.slice(0, 80), title: row.title.slice(0, 100), body: row.body.slice(0, 300),
        createdAt: Number.isFinite(Number(row.createdAt)) ? Number(row.createdAt) : Date.now(),
        read: row.read === true, tag: typeof row.tag === 'string' ? row.tag.slice(0, 80) : undefined,
      }];
    }).slice(0, MAX_NOTIFICATIONS);
  } catch { return []; }
}
function writeNotifications(items: AppNotification[]): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, MAX_NOTIFICATIONS))); } catch { /* Notifications are best-effort. */ }
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('nuvio:notifications-updated'));
}
export function notifyUser(input: { title: string; body: string; tag?: string; osNotification?: boolean }): AppNotification {
  const entry: AppNotification = { id: crypto.randomUUID(), title: input.title.slice(0, 100), body: input.body.slice(0, 300), createdAt: Date.now(), read: false, tag: input.tag?.slice(0, 80) };
  writeNotifications([entry, ...readNotifications()]);
  if (input.osNotification && notificationPermission() === 'granted' && document.visibilityState === 'hidden') {
    try { new Notification(entry.title, { body: entry.body, tag: entry.tag }); } catch { /* Browser notification delivery is optional. */ }
  }
  return entry;
}
export function markAllNotificationsRead(): void { writeNotifications(readNotifications().map(item => ({ ...item, read: true }))); }
export function clearNotifications(): void { writeNotifications([]); }
