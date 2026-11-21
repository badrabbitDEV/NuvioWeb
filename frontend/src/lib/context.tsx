import { createContext, useContext, type Dispatch, type SetStateAction } from 'react';
import type { Edition, InstalledAddon, MediaItem, Profile, UserSettings } from '../types';

export type AppContextValue = {
  edition: Edition;
  setEdition: Dispatch<SetStateAction<Edition>>;
  addons: InstalledAddon[];
  setAddons: Dispatch<SetStateAction<InstalledAddon[]>>;
  library: MediaItem[];
  setLibrary: Dispatch<SetStateAction<MediaItem[]>>;
  settings: UserSettings;
  setSettings: Dispatch<SetStateAction<UserSettings>>;
  profiles: Profile[];
  setProfiles: Dispatch<SetStateAction<Profile[]>>;
  activeProfileId: string;
  setActiveProfileId: Dispatch<SetStateAction<string>>;
};

export const AppContext = createContext<AppContextValue | null>(null);
export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp precisa estar dentro de AppContext.Provider');
  return context;
}
