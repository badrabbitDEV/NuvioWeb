import { NavLink, Outlet, useLocation } from 'react-router-dom';
import type { CSSProperties } from 'react';
import { Clapperboard, Home, Library, Puzzle, Search, Settings, Sparkles, MonitorPlay, Network, Tv, Users, UserRound, Download, Link2, FolderHeart, Cloud } from 'lucide-react';
import { useApp } from '../lib/context';
import { trackEvent } from '../lib/analytics';

const links = [
  { to: '/', label: 'Início', icon: Home, end: true },
  { to: '/search', label: 'Buscar', icon: Search },
  { to: '/library', label: 'Biblioteca', icon: Library },
  { to: '/addons', label: 'Addons', icon: Puzzle },
  { to: '/p2p', label: 'P2P', icon: Network },
  { to: '/live', label: 'TV ao vivo', icon: Tv },
  { to: '/party', label: 'Watch Party', icon: Users },
  { to: '/downloads', label: 'Downloads', icon: Download },
  { to: '/collections', label: 'Coleções', icon: FolderHeart },
  { to: '/integrations', label: 'Integrações', icon: Link2 },
  { to: '/profiles', label: 'Perfis', icon: UserRound },
  { to: '/account', label: 'Conta e Sync', icon: Cloud },
  { to: '/settings', label: 'Config', icon: Settings },
];

const pageTitles: Record<string, string> = {
  '/': 'Descobrir', '/search': 'Buscar', '/library': 'Minha biblioteca', '/addons': 'Addons', '/p2p': 'P2P no navegador', '/live': 'TV ao vivo', '/party': 'Watch Party', '/downloads': 'Downloads', '/collections': 'Coleções', '/integrations': 'Integrações', '/profiles': 'Perfis', '/account': 'Conta e sincronização', '/settings': 'Configurações',
};

export default function Shell() {
  const { edition, setEdition, addons, settings, profiles, activeProfileId } = useApp();
  const location = useLocation();
  const title = pageTitles[location.pathname] ?? (location.pathname.startsWith('/details') || location.pathname.startsWith('/addon-meta') ? 'Detalhes' : location.pathname.startsWith('/addons/catalog') ? 'Catálogo do addon' : 'Nuvio');
  const activeProfile = profiles.find(profile => profile.id === activeProfileId);
  function changeEdition(next: 'normal' | 'enhanced') {
    if (next === edition) return;
    setEdition(next);
    if (settings.analyticsOptIn) trackEvent('edition_changed', next, { route: location.pathname });
  }
  return (
    <div className={`app-frame edition-${edition} theme-${settings.theme} ${settings.glassUi ? 'glass-ui' : 'solid-ui'} ${settings.reduceMotion ? 'reduce-motion' : ''} ${settings.showCatalogUnderline ? 'catalog-underline' : ''}`} style={{ ['--accent' as string]: settings.accent, ['--accent-2' as string]: settings.accent, ['--app-wallpaper' as string]: settings.backgroundImageUrl ? `url(${JSON.stringify(settings.backgroundImageUrl)})` : 'none' } as CSSProperties}>
      <aside className="sidebar">
        <div className="brand-lockup">
          <div className="brand-mark"><Clapperboard size={22} strokeWidth={2.4} /></div>
          <div><strong>Nuvio</strong><span>WEB PORT</span></div>
        </div>
        <div className="edition-control">
          <span className="eyebrow">EXPERIÊNCIA</span>
          <div className="edition-switch" role="group" aria-label="Versão do aplicativo">
            <button className={edition === 'normal' ? 'active' : ''} onClick={() => changeEdition('normal')}>Normal</button>
            <button className={edition === 'enhanced' ? 'active' : ''} onClick={() => changeEdition('enhanced')}><Sparkles size={13} /> Enhanced</button>
          </div>
        </div>
        <nav className="side-nav" aria-label="Navegação principal">
          <span className="eyebrow nav-label">MENU</span>
          {links.filter(link => settings.showLiveTv || link.to !== '/live').map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              <Icon size={18} /><span>{label}</span>{label === 'Addons' && addons.length > 0 && <i>{addons.length}</i>}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="status-tile"><span className="status-dot" /><div><b>Modo local</b><small>Dados salvos neste dispositivo</small></div></div>
          <div className="sidebar-version">WEB PORT <span>1.0.4</span></div>
        </div>
      </aside>

      <div className="main-column">
        <header className="topbar">
          <div className="mobile-brand"><div className="brand-mark"><Clapperboard size={18} /></div><strong>Nuvio</strong></div>
          <div className="topbar-title"><span className="eyebrow">NUVIO WEB</span><h1>{title}</h1></div>
          <div className="topbar-actions">
            <div className="mobile-edition" role="group" aria-label="Versão">
              <button className={edition === 'normal' ? 'active' : ''} onClick={() => changeEdition('normal')}>Normal</button>
              <button className={edition === 'enhanced' ? 'active' : ''} onClick={() => changeEdition('enhanced')}>Enhanced</button>
            </div>
            <NavLink to="/search" className="icon-button" aria-label="Buscar"><Search size={18} /></NavLink>
            <NavLink to="/profiles" className="profile-chip" title={activeProfile?.name ?? 'Perfil'}><span>{activeProfile?.avatar ?? 'U'}</span></NavLink>
          </div>
        </header>
        <main className="page-content"><Outlet /></main>
        <footer className="site-footer"><span>Projeto comunitário independente. Não afiliado à equipe Nuvio.</span><span><MonitorPlay size={13} /> Funciona em desktop, tablet e celular</span></footer>
      </div>

      <nav className="mobile-nav" aria-label="Navegação móvel">
        {links.filter(link => settings.showLiveTv || link.to !== '/live').slice(0,5).map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => `mobile-nav-link ${isActive ? 'active' : ''}`}>
            <Icon size={20} /><span>{label}</span>
          </NavLink>
        ))}
        <NavLink to="/more" className={({ isActive }) => `mobile-nav-link ${isActive ? 'active' : ''}`}><Settings size={20}/><span>Mais</span></NavLink>
      </nav>
    </div>
  );
}
