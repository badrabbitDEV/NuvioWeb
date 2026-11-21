[Uploading README.md…]()
# Frontend feature modules

Each directory owns the domain logic for one feature. Page components should remain focused on layout, user input, and navigation; reusable state transitions, browser APIs, validation, and service calls live here.

| Module | Public entry | Responsibility | Connected screens |
|---|---|---|---|
| `collections/` | `index.ts` | Collection model, normalization, stable media keys and item operations | `pages/Collections.tsx` |
| `downloads/` | `index.ts` | HTTPS validation, bounded downloads, IndexedDB persistence, quota estimate and offline object URLs | `pages/Downloads.tsx`, `pages/Player.tsx` |
| `live/` | `index.ts` | M3U/XMLTV parsing facade, bounded gzip XMLTV import (20 MiB input / 100 MiB expanded), channel filtering, EPG lookup and playable URL validation | `pages/LiveTV.tsx` |
| `notifications/` | `index.ts` | Local notification store, browser permission and notification center | `pages/Settings.tsx`, `pages/Downloads.tsx` |
| `party/` | `index.ts` | Singleton WebSocket client, room validation, event fan-out, chat and playback sync | `pages/Party.tsx`, `lib/party-client.ts`, `pages/Player.tsx` |
| `profiles/` | `index.ts` | Profile creation, PBKDF2 PIN hashing/verification and deletion of profile-scoped local data | `pages/Profiles.tsx` |
| `servers/` | `index.ts` | Jellyfin/Emby authentication and library reads; Plex section and item reads | `pages/Integrations.tsx` |
| `tracking/` | `index.ts` | Trakt/SIMKL device authorization, watched-item retrieval and Trakt scrobble | `pages/Integrations.tsx`, `pages/Player.tsx` |

## Important platform boundaries

- Browser downloads are direct HTTPS files and are limited to 500 MiB per item in this UI. CORS, storage quota, available memory, and browser eviction policies still apply. They are not a background download manager and do not support torrent downloads.
- Offline playback uses a temporary `blob:` object URL, which is revoked when the player screen is left.
- Watch Party uses the configured API WebSocket. Rooms are temporary in-memory sessions unless the backend is separately extended with persistent storage.
- Jellyfin/Emby/Plex connections are browser-to-server requests; the media server must allow the web app's origin through CORS. Remote servers require HTTPS.
- PIN is a casual local profile lock, not secure authentication or a substitute for OS parental controls. New PIN hashes use PBKDF2-SHA-256; the verifier retains compatibility with the prior SHA-256 format.
- Notifications are stored locally. System notifications are only shown after explicit browser permission; this module does not implement server-side Web Push delivery.
- Trakt/SIMKL device authorization and scrobbling still require the backend environment variables and valid provider credentials.

## Maintenance rules

1. Keep public exports in each module's `index.ts`.
2. Do not place API secrets in frontend code or localStorage; provider session tokens stay in `sessionStorage` where applicable.
3. Validate external URLs and bound payload sizes before fetching or persisting data.
4. Update the page and module together when changing a feature contract.
5. Run root `npm run typecheck`, `npm test`, and `npm run build` after installing the workspace dependencies; static parsing alone is not a replacement for those checks.
