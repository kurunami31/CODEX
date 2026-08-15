import { useCallback, useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { supabase } from '../lib/supabase';
import { timeAgo } from '../lib/format';
import { hasLocalSubscription } from '../lib/push';
import Avatar from '../components/Avatar';
import { isStaff as checkStaff, isAdmin as checkAdmin, roleLabel } from '../lib/roles';
import { HomeIcon, RssIcon, CalendarIcon, IdIcon, ShieldIcon, LogOutIcon, SearchIcon, CameraIcon, GearIcon, SunIcon, MoonIcon, CrownIcon, MenuIcon, XIcon, TrophyIcon, CertificateIcon, GavelIcon, BellIcon } from '../components/icons/Icons';

const TITLES = {
  '/app/feed': 'feed',
  '/app/events': 'events',
  '/app/idcard': 'my id',
  '/app/leaderboard': 'leaderboard',
  '/app/certificates': 'certificates',
  '/app/elections': 'elections',
  '/app/directory': 'member ids',
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
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef(null);
  const notifRef = useRef(null);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifItems, setNotifItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [pushOn, setPushOn] = useState(false);

  const loadNotifs = useCallback(async () => {
    if (!user) return;
    const [items, count] = await Promise.all([
      supabase.from('notifications').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(10),
      supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('read', false),
    ]);
    if (!items.error) setNotifItems(items.data || []);
    if (!count.error) setUnread(count.count || 0);
  }, [user]);

  // Load on mount, then poll quietly so the badge stays fresh.
  useEffect(() => {
    loadNotifs();
    const t = setInterval(loadNotifs, 30_000);
    return () => clearInterval(t);
  }, [loadNotifs]);

  // close the dropdown on outside click
  useEffect(() => {
    const onClick = (e) => {
      if (notifRef.current && !notifRef.current.contains(e.target)) setNotifOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const toggleNotifs = async () => {
    const next = !notifOpen;
    setNotifOpen(next);
    if (next) {
      loadNotifs();
      hasLocalSubscription().then((on) => setPushOn(on));
    }
  };

  const markAllRead = async () => {
    if (unread === 0) return;
    const { error } = await supabase.from('notifications').update({ read: true }).eq('user_id', user.id).eq('read', false);
    if (!error) loadNotifs();
  };

  const openNotification = async (item) => {
    setNotifOpen(false);
    if (!item.read) {
      const { error } = await supabase.from('notifications').update({ read: true }).eq('id', item.id);
      if (!error) loadNotifs();
    }
    goto(item.url || '/app/feed');
  };

  const staff = checkStaff(profile?.role);
  const admin = checkAdmin(profile?.role);

  const runSearch = async (q) => {
    const term = q.trim();
    if (term.length < 2) {
      setResults(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    const like = `%${term}%`;
    const [posts, events, members] = await Promise.all([
      supabase
        .from('posts')
        .select('id, content, created_at, profiles!posts_author_id_fkey(full_name)')
        .ilike('content', like)
        .order('created_at', { ascending: false })
        .limit(4),
      supabase
        .from('events')
        .select('id, title, event_date, location')
        .ilike('title', like)
        .order('event_date', { ascending: true })
        .limit(4),
      supabase
        .from('profiles')
        .select('id, full_name, student_id, section, year_level, avatar_url, role')
        .or(`full_name.ilike.${like},student_id.ilike.${like}`)
        .limit(4),
    ]);
    setResults({ posts: posts.data || [], events: events.data || [], members: members.data || [] });
    setSearching(false);
  };

  // debounced live search
  useEffect(() => {
    if (query.trim().length < 2) {
      setResults(null);
      setSearching(false);
      setSearchOpen(false);
      return;
    }
    const t = setTimeout(() => {
      setSearchOpen(true);
      runSearch(query);
    }, 220);
    return () => clearTimeout(t);
  }, [query]);

  // close the dropdown on outside click
  useEffect(() => {
    const onClick = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) setSearchOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const goto = (to) => {
    setQuery('');
    setResults(null);
    setSearchOpen(false);
    navigate(to);
  };

  const title = TITLES[location.pathname] || 'codex';

  const navItems = [
    { to: '/app/feed', label: 'Feed', icon: <RssIcon width={20} height={20} /> },
    { to: '/app/events', label: 'Events', icon: <CalendarIcon width={20} height={20} /> },
    { to: '/app/idcard', label: 'My ID', icon: <IdIcon width={20} height={20} /> },
    { to: '/app/leaderboard', label: 'Leaderboard', icon: <TrophyIcon width={20} height={20} /> },
    { to: '/app/certificates', label: 'Certificates', icon: <CertificateIcon width={20} height={20} /> },
    { to: '/app/elections', label: 'Elections', icon: <GavelIcon width={20} height={20} /> },
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
              <NavLink
                to="/app/directory"
                className={({ isActive }) => `nav-item${isActive ? ' nav-item--on' : ''}`}
              >
                <IdIcon width={20} height={20} />
                Member IDs
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
          <div className="search-wrap" ref={searchRef}>
            <div className="search-box">
              <SearchIcon width={16} height={16} />
              <input
                placeholder="Search posts, events, members…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onFocus={() => { if (results) setSearchOpen(true); }}
              />
              {searching && <span className="spinner-mini" />}
            </div>
            {searchOpen && results && (
              <div className="search-panel">
                {results.posts.length === 0 && results.events.length === 0 && results.members.length === 0 ? (
                  <div className="search-empty">No matches for “{query.trim()}”</div>
                ) : (
                  <>
                    {results.posts.length > 0 && (
                      <>
                        <div className="search-group">posts</div>
                        {results.posts.map((p) => (
                          <button key={p.id} className="search-item" onClick={() => goto('/app/feed')}>
                            <span className="ico"><RssIcon width={15} height={15} /></span>
                            <span style={{ flex: 1, minWidth: 0 }}>
                              <b>{p.content}</b>
                              <span>{p.profiles?.full_name || 'Member'} · {timeAgo(p.created_at)}</span>
                            </span>
                          </button>
                        ))}
                      </>
                    )}
                    {results.events.length > 0 && (
                      <>
                        <div className="search-group">events</div>
                        {results.events.map((e) => (
                          <button key={e.id} className="search-item" onClick={() => goto(`/app/events/${e.id}`)}>
                            <span className="ico"><CalendarIcon width={15} height={15} /></span>
                            <span style={{ flex: 1, minWidth: 0 }}>
                              <b>{e.title}</b>
                              <span>{e.location || 'TBA'}</span>
                            </span>
                          </button>
                        ))}
                      </>
                    )}
                    {results.members.length > 0 && (
                      <>
                        <div className="search-group">members</div>
                        {results.members.map((m) => (
                          admin ? (
                            <button key={m.id} className="search-item" onClick={() => goto('/app/admin')}>
                              <Avatar name={m.full_name} seed={m.student_id || m.id} size={30} url={m.avatar_url} />
                              <span style={{ flex: 1, minWidth: 0 }}>
                                <b>{m.full_name || 'Member'}</b>
                                <span>{m.year_level} · {m.section}{m.student_id ? ` · ${m.student_id}` : ''}</span>
                              </span>
                            </button>
                          ) : (
                            <div key={m.id} className="search-item search-item--plain">
                              <Avatar name={m.full_name} seed={m.student_id || m.id} size={30} url={m.avatar_url} />
                              <span style={{ flex: 1, minWidth: 0 }}>
                                <b>{m.full_name || 'Member'}</b>
                                <span>{m.year_level} · {m.section}{m.student_id ? ` · ${m.student_id}` : ''}</span>
                              </span>
                            </div>
                          )
                        ))}
                      </>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
          <div className="notif-wrap" ref={notifRef}>
            <button
              className={`icon-btn notif-btn${notifOpen ? ' notif-btn--open' : ''}`}
              onClick={toggleNotifs}
              aria-label="Notifications"
              aria-haspopup="true"
              aria-expanded={notifOpen}
            >
              <BellIcon width={16} height={16} />
              {unread > 0 && <span className="notif-badge">{unread > 9 ? '9+' : unread}</span>}
            </button>
            {notifOpen && (
              <div className="notif-panel">
                <div className="notif-head">
                  <b>notifications</b>
                  <button className="btn btn-ghost btn-sm" onClick={markAllRead} disabled={unread === 0}>
                    Mark all read
                  </button>
                </div>
                {notifItems.length === 0 ? (
                  <div className="notif-empty">You're all caught up — no alerts yet.</div>
                ) : (
                  <div className="notif-list">
                    {notifItems.map((n) => (
                      <button
                        key={n.id}
                        className={`notif-item${n.read ? '' : ' notif-item--unread'}`}
                        onClick={() => openNotification(n)}
                      >
                        <span className={`notif-dot${n.read ? ' notif-dot--read' : ''}`} aria-hidden="true" />
                        <span className="notif-item-body">
                          <b>{n.title}</b>
                          {n.body && <span>{n.body}</span>}
                          <span className="ocr-label">{timeAgo(n.created_at)}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                <div className="notif-foot">
                  <span className="ocr-label">push alerts: {pushOn ? 'on for this device' : 'off'}</span>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      setNotifOpen(false);
                      goto('/app/settings');
                    }}
                  >
                    <GearIcon width={13} height={13} /> settings
                  </button>
                </div>
              </div>
            )}
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
              <NavLink to="/app/directory" className="nav-item">
                <IdIcon width={20} height={20} />
                Member IDs
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
