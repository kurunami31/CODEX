import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import Avatar from '../components/Avatar';
import { HomeIcon, RssIcon, CalendarIcon, IdIcon, ShieldIcon, LogOutIcon, SearchIcon, CameraIcon, GearIcon, SunIcon, MoonIcon } from '../components/icons/Icons';

const TITLES = {
  '/app/feed': 'feed',
  '/app/events': 'events',
  '/app/idcard': 'my id',
  '/app/admin': 'control',
  '/app/settings': 'settings',
};

export default function AppShell() {
  const { profile, user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();

  const isStaff = profile?.role === 'admin' || profile?.role === 'moderator';

  const title = TITLES[location.pathname] || 'codex';

  const navItems = [
    { to: '/app/feed', label: 'Feed', icon: <RssIcon width={20} height={20} /> },
    { to: '/app/events', label: 'Events', icon: <CalendarIcon width={20} height={20} /> },
    { to: '/app/idcard', label: 'My ID', icon: <IdIcon width={20} height={20} /> },
    { to: '/app/settings', label: 'Settings', icon: <GearIcon width={20} height={20} /> },
    ...(profile?.role === 'admin' ? [{ to: '/app/admin', label: 'Control', icon: <ShieldIcon width={20} height={20} /> }] : []),
  ];

  const handleLogout = async () => {
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

          {isStaff && (
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
              <div className="u-role">{profile?.role || '…'}</div>
            </div>
            <button className="icon-btn" style={{ marginLeft: 'auto', width: 32, height: 32, borderRadius: 9 }} onClick={handleLogout} title="Log out" aria-label="Log out">
              <LogOutIcon width={15} height={15} />
            </button>
          </div>
        </div>
      </aside>

      <div className="main-col">
        <header className="topbar">
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

      <nav className="bottomnav">
        <ul>
          {navItems.map((item) => (
            <li key={item.to}>
              <NavLink to={item.to} className={({ isActive }) => (isActive ? 'a--on' : '')}>
                {item.icon}
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
