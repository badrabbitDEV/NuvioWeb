export type Edition = 'normal' | 'enhanced';
export type MediaType = 'movie' | 'tv' | 'series' | 'channel' | 'person';

export type MediaItem = {
  id: number;
  media_type?: 'movie' | 'tv' | 'person';
  type?: string;
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  overview?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  vote_average?: number;
  release_date?: string;
  first_air_date?: string;
  runtime?: number;
  genre_ids?: number[];
  genres?: Array<{ id: number; name: string }>;
  logo_path?: string | null;
  external_ids?: { imdb_id?: string; tvdb_id?: number; wikidata_id?: string; anilist_id?: number; mal_id?: number };
  sourceProvider?: 'anilist' | 'jellyfin' | 'emby' | 'plex';
  sourceId?: number | string;
  sourcePosterUrl?: string;
  sourceBackdropUrl?: string;
  sourceStatus?: string;
  sourceProgress?: number;
  [key: string]: unknown;
};

export type AddonManifest = {
  id: string;
  name: string;
  description?: string;
  version?: string;
  logo?: string;
  background?: string;
  contactEmail?: string;
  resources: Array<string | { name: string; types?: string[]; idPrefixes?: string[] }>;
  catalogs?: Array<{ type: string; id: string; name: string; extra?: Array<{ name: string; isRequired?: boolean; options?: string[] }> }>;
  types?: string[];
  idPrefixes?: string[];
  behaviorHints?: { configurable?: boolean; configurationRequired?: boolean; adult?: boolean };
  [key: string]: unknown;
};

export type InstalledAddon = {
  manifestUrl: string;
  manifest: AddonManifest;
  installedAt: string;
  enabled?: boolean;
  pinned?: boolean;
  order?: number;
};

export type StreamSubtitle = { id?: string; url?: string; lang?: string; label?: string; mimeType?: string };
export type Stream = {
  name?: string;
  title?: string;
  url?: string;
  externalUrl?: string;
  infoHash?: string;
  description?: string;
  addonName?: string;
  behaviorHints?: { notWebReady?: boolean; bingeGroup?: string; filename?: string; videoHash?: string; [key: string]: unknown };
  subtitles?: StreamSubtitle[];
  fileIdx?: number;
  mimeType?: string;
  sources?: string[];
  size?: number;
  introStart?: number;
  introEnd?: number;
  creditsStart?: number;
  audio?: string[];
  language?: string;
  [key: string]: unknown;
};

export type WatchProgress = {
  mediaKey: string;
  item: MediaItem;
  position: number;
  duration: number;
  completed: boolean;
  updatedAt: number;
  season?: number;
  episode?: number;
};

export type Profile = {
  id: string;
  name: string;
  avatar: string;
  color: string;
  isKids: boolean;
  pinHash?: string;
  createdAt: number;
};

export type UserSettings = {
  glassUi: boolean;
  preferredLanguage: string;
  reduceMotion: boolean;
  theme: 'dark' | 'midnight' | 'amoled' | 'light';
  accent: string;
  homeHeroStyle: 'full' | 'card';
  dynamicBackground: boolean;
  showCatalogUnderline: boolean;
  showLiveTv: boolean;
  streamSort: 'addon' | 'best' | 'quality' | 'smallest' | 'largest';
  hideCam: boolean;
  preferredAudio: string;
  subtitleLanguage: string;
  playbackSpeed: number;
  skipIntroSeconds: number;
  privateViewing: boolean;
  trailerAutoplay: boolean;
  backgroundImageUrl?: string;
  analyticsOptIn?: boolean;
  curatedAddonFeedUrl?: string;
  subtitleSize?: number;
  subtitleColor?: string;
  subtitleFont?: 'system'|'arial'|'serif'|'monospace'|'custom';
  subtitleCustomFontData?: string;
  subtitleCustomFontName?: string;
  showOriginalTitles?: boolean;
  streamAutoPlay?: 'manual'|'best';
  streamTimeoutSeconds?: number;
  autoNextEpisode?: boolean;
  showSkipButtons?: boolean;
  [key: string]: boolean | number | string | undefined;
};

export type LiveChannel = {
  id: string;
  name: string;
  url: string;
  logo?: string;
  group?: string;
  tvgId?: string;
  tvgName?: string;
  language?: string;
  provider?: 'm3u'|'xtream'|'stalker';
  stalkerCmd?: string;
  stalkerChannelId?: string;
  stalkerPortalUrl?: string;
  stalkerToken?: string;
  stalkerMac?: string;
};

export type EpgProgramme = {
  channelId: string;
  title: string;
  description?: string;
  start: number;
  stop: number;
  category?: string;
};

export type DownloadRecord = {
  id: string;
  title: string;
  url: string;
  mimeType: string;
  size: number;
  createdAt: number;
  profileId?: string;
  blob?: Blob;
};

export type TrackingProvider = 'trakt' | 'simkl' | 'anilist' | 'mdblist' | 'publicmetadb' | 'wetrakr';

export type AddonMeta = {
  id: string;
  type: string;
  name: string;
  description?: string;
  poster?: string;
  background?: string;
  logo?: string;
  releaseInfo?: string;
  imdbRating?: string;
  genres?: string[];
  runtime?: string;
  director?: string[];
  cast?: string[];
  videos?: Array<{ id: string; title?: string; released?: string; season?: number; episode?: number; overview?: string }>;
  links?: Array<{ name: string; category?: string; url: string }>;
  behaviorHints?: { defaultVideoId?: string; hasScheduledVideos?: boolean };
  [key: string]: unknown;
};
