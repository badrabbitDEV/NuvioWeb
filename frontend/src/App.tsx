import { BrowserRouter, Route, Routes } from 'react-router-dom';
import type { Dispatch, SetStateAction } from 'react';
import { AppContext } from './lib/context';
import { readStored, useStoredState } from './lib/storage';
import type { Edition, InstalledAddon, MediaItem, Profile, UserSettings } from './types';
import Shell from './components/Shell';
import Discover from './pages/Discover';
import Search from './pages/Search';
import Library from './pages/Library';
import Addons from './pages/Addons';
import Settings from './pages/Settings';
import Details from './pages/Details';
import Player from './pages/Player';
import P2P from './pages/P2P';
import LiveTV from './pages/LiveTV';
import Party from './pages/Party';
import Profiles from './pages/Profiles';
import Downloads from './pages/Downloads';
import Integrations from './pages/Integrations';
import Collections from './pages/Collections';
import Account from './pages/Account';
import AddonCatalog from './pages/AddonCatalog';
import AddonMetaPage from './pages/AddonMeta';
import More from './pages/More';
import AniListDetails from './pages/AniListDetails';
import AdminDashboard from './pages/AdminDashboard';
import AnalyticsTracker from './components/AnalyticsTracker';

const defaultEdition = (import.meta.env.VITE_DEFAULT_EDITION === 'enhanced' ? 'enhanced' : 'normal') as Edition;
const defaultSettings: UserSettings = { glassUi: true, preferredLanguage: 'pt-BR', reduceMotion: false, theme: 'midnight', accent: '#8b7cff', homeHeroStyle: 'full', dynamicBackground: true, showCatalogUnderline: true, showLiveTv: true, streamSort: 'best', hideCam: true, preferredAudio: 'pt-br', subtitleLanguage: 'pt-br', playbackSpeed: 1, skipIntroSeconds: 0, privateViewing: false, trailerAutoplay: false, analyticsOptIn: false, curatedAddonFeedUrl: '', subtitleSize: 1, subtitleColor: '#ffffff', subtitleFont: 'system', streamAutoPlay: 'manual', streamTimeoutSeconds: 12, autoNextEpisode: true, showSkipButtons: true, backgroundImageUrl: '' };
const defaultProfiles: Profile[] = [{ id: 'main', name: 'Principal', avatar: '🎬', color: '#8b7cff', isKids: false, createdAt: Date.now() }];

function ProfileSession(props: {
  profileId: string;
  edition: Edition;
  setEdition: Dispatch<SetStateAction<Edition>>;
  profiles: Profile[];
  setProfiles: Dispatch<SetStateAction<Profile[]>>;
  activeProfileId: string;
  setActiveProfileId: Dispatch<SetStateAction<string>>;
}) {
  const { profileId, ...profileProps } = props;
  const [addons, setAddons] = useStoredState<InstalledAddon[]>(`nuvio-web:${profileId}:addons`, profileId === 'main' ? readStored('nuvio-web:addons', []) : []);
  const [library, setLibrary] = useStoredState<MediaItem[]>(`nuvio-web:${profileId}:library`, profileId === 'main' ? readStored('nuvio-web:library', []) : []);
  const [settings, setSettings] = useStoredState<UserSettings>(`nuvio-web:${profileId}:settings`, profileId === 'main' ? readStored('nuvio-web:settings', defaultSettings) : defaultSettings);
  return <AppContext.Provider value={{ ...profileProps, addons, setAddons, library, setLibrary, settings, setSettings }}>
    <BrowserRouter>
      <AnalyticsTracker />
      <Routes>
        <Route path="admin" element={<AdminDashboard />} />
        <Route element={<Shell />}>
          <Route index element={<Discover />} />
          <Route path="search" element={<Search />} />
          <Route path="library" element={<Library />} />
          <Route path="addons" element={<Addons />} />
          <Route path="addons/catalog/:addonId/:type/:catalogId" element={<AddonCatalog />} />
          <Route path="addon-meta" element={<AddonMetaPage />} />
          <Route path="p2p" element={<P2P />} />
          <Route path="live" element={<LiveTV />} />
          <Route path="party" element={<Party />} />
          <Route path="profiles" element={<Profiles />} />
          <Route path="downloads" element={<Downloads />} />
          <Route path="collections" element={<Collections />} />
          <Route path="integrations" element={<Integrations />} />
          <Route path="account" element={<Account />} />
          <Route path="more" element={<More />} />
          <Route path="settings" element={<Settings />} />
          <Route path="details/:type/:id" element={<Details />} />
          <Route path="anilist/:id" element={<AniListDetails />} />
        </Route>
        <Route path="watch" element={<Player />} />
        <Route path="*" element={<Shell />} />
      </Routes>
    </BrowserRouter>
  </AppContext.Provider>;
}

export default function App() {
  const [edition, setEdition] = useStoredState<Edition>('nuvio-web:edition', defaultEdition);
  const [profiles, setProfiles] = useStoredState<Profile[]>('nuvio-web:profiles', defaultProfiles);
  const [activeProfileId, setActiveProfileId] = useStoredState<string>('nuvio-web:active-profile', 'main');
  const safeProfileId = profiles.some((profile) => profile.id === activeProfileId) ? activeProfileId : (profiles[0]?.id ?? 'main');
  return <ProfileSession key={safeProfileId} profileId={safeProfileId} edition={edition} setEdition={setEdition} profiles={profiles} setProfiles={setProfiles} activeProfileId={safeProfileId} setActiveProfileId={setActiveProfileId} />;
}
