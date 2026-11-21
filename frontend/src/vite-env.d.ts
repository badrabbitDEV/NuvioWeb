/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_DEFAULT_EDITION?: string;
  readonly VITE_WEBTORRENT_TRACKERS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
