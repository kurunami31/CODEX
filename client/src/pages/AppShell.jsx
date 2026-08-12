import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import Avatar from '../components/Avatar';
import { isStaff as checkStaff, isAdmin as checkAdmin, roleLabel } from '../lib/roles';
import { HomeIcon, RssIcon, CalendarIcon, IdIcon, ShieldIcon, LogOutIcon, SearchIcon, CameraIcon, GearIcon, SunIcon, MoonIcon, CrownIcon, MenuIcon, XIcon } from '../components/icons/Icons';

const TITLES = {
  '/app/feed': 'feed',
  '/app/events': 'events',
  '/app/idcard': 'my id',
  '/app/admin': 'control',
  '/app/superadmin': 'root access',
  '/app/settings': 'settings',
};

export default function AppShell() {
  const { profile, user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  const staff = checkStaff(profile?.role);

  const title = TITLES[location.pathname] || 'codex';

  const navItems = [
    { to: '/app/feed', label: 'Feed', icon: <RssIcon width={20} height={20} /> },
    { to: '/app/events', label: 'Events', icon: <CalendarIcon width={20} height={20} /> },
    { to: '/app/idcard', label: 'My ID', icon: <IdIcon width={20} height={20} /> },
    { to: '/app/settings', label: 'Settings', icon: <GearIcon width={20} height={20} /> },
    ...(checkAdmin(profile?.role) ? [{ to: '/app/admin', label: 'Control', icon: <ShieldIcon width={20} height={20} /> }] : []),
    ...(profile?.role === 'superadmin' ? [{ to: '/app/superadmin', label: 'Super Admin', icon: <CrownIcon width={20} height={20} /> }] : []),
  ];

  // close the mobile drawer whenever the route changes
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  // lock background scroll while the mobile drawer is open
  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [menuOpen]);

  const handleLogout = async () => {
    setMenuOpen(false);
    await logout();
    navigate('/welcome');
  };

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <img src="/assets/codebyterts-logo.gif" alt="CODEBYTERS" />
          <div>
            <div className="brand-name">CODEX</div>
            <div className="brand-sub">codebyters community</div>
          </div>
        </div>

        <nav>
          <div className="nav-group">terminal</div>
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `nav-item${isActive ? ' nav-item--on' : ''}`}
            >
              {item.icon}
              {item.label}
              {item.label === 'My ID' && <span className="nav-badge">QR</span>}
            </NavLink>
          ))}

          {staff && (
            <>
              <div className="nav-group">staff tools</div>
              <NavLink
                to="/app/events"
                className={({ isActive }) => `nav-item${location.pathname.startsWith('/app/scanner') ? ' nav-item--on' : ''}`}
              >
                <CameraIcon width={20} height={20} />
                Scan QR
              </NavLink>
            </>
          )}
        </nav>

        <div className="side-foot">
          <div className="user-card">
            <Avatar name={profile?.full_name} seed={user?.id} size={36} ring url={profile?.avatar_url} />
            <div style={{ minWidth: 0 }}>
              <div className="u-name" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{profile?.full_name || '…'}</div>
              <div className="u-role">{roleLabel(profile?.role)}</div>
            </div>
            <button className="icon-btn" style={{ marginLeft: 'auto', width: 32, height: 32, borderRadius: 9 }} onClick={handleLogout} title="Log out" aria-label="Log out">
              <LogOutIcon width={15} height={15} />
            </button>
          </div>
        </div>
      </aside>

      <div className="main-col">
        <header className="topbar">
          <button
            className="menu-toggle"
            onClick={() => setMenuOpen((o) => !o)}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
          >
            {menuOpen ? <XIcon width={19} height={19} /> : <MenuIcon width={19} height={19} />}
          </button>
          <span className="page-title">
            <span className="crumb">codex://</span>
            {title}
            <span className="cursor-blink" style={{ color: 'var(--accent)', fontFamily: 'var(--f-ocr)' }} />
          </span>
          <div className="search-box">
            <SearchIcon width={16} height={16} />
            <input placeholder="Search the community… (coming soon)" readOnly />
          </div>
          <button
            className="icon-btn theme-toggle"
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? <SunIcon width={16} height={16} /> : <MoonIcon width={16} height={16} />}
          </button>
        </header>

        <main className="page">
          <Outlet />
        </main>
      </div>

      <nav className="bottomnav" aria-label="Primary">
        <ul>
          {/* core tabs only — admin tools live in the hamburger drawer so the
              pill always fits on small screens */}
          {navItems
            .filter((item) => ['/app/feed', '/app/events', '/app/idcard', '/app/settings'].includes(item.to))
            .map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                className={({ isActive }) => (isActive ? 'nav-link--on' : '')}
                aria-current={item.to === location.pathname ? 'page' : undefined}
              >
                <span className="nav-dot" aria-hidden="true" />
                {item.icon}
                <span>{item.label}</span>
              </NavLink>
            </li>
          ))}
          {staff && (
            <li>
              <NavLink
                to="/app/events"
                className={() => (location.pathname.startsWith('/app/scanner') ? 'nav-link--on' : '')}
                aria-current={location.pathname.startsWith('/app/scanner') ? 'page' : undefined}
              >
                <span className="nav-dot" aria-hidden="true" />
                <CameraIcon width={18} height={18} />
                <span>Scan</span>
              </NavLink>
            </li>
          )}
        </ul>
      </nav>

      {/* mobile drawer */}
      <div
        className={`drawer-back${menuOpen ? ' drawer-back--open' : ''}`}
        onClick={() => setMenuOpen(false)}
        aria-hidden={!menuOpen}
      />
      <aside className={`drawer${menuOpen ? ' drawer--open' : ''}`} aria-hidden={!menuOpen}>
        <div className="brand">
          <img src="/assets/codebyterts-logo.gif" alt="CODEBYTERS" />
          <div>
            <div className="brand-name">CODEX</div>
            <div className="brand-sub">codebyters community</div>
          </div>
        </div>
        <nav>
          <div className="nav-group">terminal</div>
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `nav-item${isActive ? ' nav-item--on' : ''}`}
            >
              {item.icon}
              {item.label}
              {item.label === 'My ID' && <span className="nav-badge">QR</span>}
            </NavLink>
          ))}
          {staff && (
            <>
              <div className="nav-group">staff tools</div>
              <NavLink to="/app/events" className="nav-item">
                <CameraIcon width={20} height={20} />
                Scan QR
              </NavLink>
            </>
          )}
        </nav>
        <div className="drawer-foot">
          <div className="user-card">
            <Avatar name={profile?.full_name} seed={user?.id} size={36} ring url={profile?.avatar_url} />
            <div style={{ minWidth: 0 }}>
              <div className="u-name">{profile?.full_name || '…'}</div>
              <div className="u-role">{roleLabel(profile?.role)}</div>
            </div>
            <button className="icon-btn" style={{ marginLeft: 'auto', width: 32, height: 32, borderRadius: 9 }} onClick={handleLogout} title="Log out" aria-label="Log out">
              <LogOutIcon width={15} height={15} />
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}
