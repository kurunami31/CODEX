import { useEffect, useRef, useState, lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import LoadingScreen from './pages/LoadingScreen';
import MaintenancePage from './pages/MaintenancePage';
import Welcome from './pages/Welcome';
import Auth from './pages/Auth';
import AppShell from './pages/AppShell';
import Feed from './pages/Feed';
import Events from './pages/Events';
import ChatAssistant from './components/ChatAssistant';
import ConfigGate from './components/ConfigGate';

const EventDetail = lazy(() => import('./pages/EventDetail'));
const MyId = lazy(() => import('./pages/MyId'));
const Profile = lazy(() => import('./pages/Profile'));
const ProfileSettings = lazy(() => import('./pages/ProfileSettings'));
const ScannerPage = lazy(() => import('./pages/ScannerPage'));
const Leaderboard = lazy(() => import('./pages/Leaderboard'));
const Certificates = lazy(() => import('./pages/Certificates'));
const Elections = lazy(() => import('./pages/Elections'));
const Directory = lazy(() => import('./pages/Directory'));
const Admin = lazy(() => import('./pages/Admin'));
const SuperAdmin = lazy(() => import('./pages/SuperAdmin'));
const Adviser = lazy(() => import('./pages/Adviser'));
const About = lazy(() => import('./pages/About'));

function Lazy({ children }) {
  return <Suspense fallback={<div style={{ padding: 30 }}><div className="skeleton" style={{ height: 160 }} /></div>}>{children}</Suspense>;
}

function RequireAuth({ children }) {
  const { session, loading } = useAuth();
  const location = useLocation();
  if (loading) return <LoadingScreen mode="inline" />;
  if (!session) return <Navigate to="/auth" state={{ from: location }} replace />;
  return children;
}

function RequireRole({ roles, children }) {
  const { profile, loading } = useAuth();
  if (loading || !profile) return null;
  if (!roles.includes(profile.role)) return <Navigate to="/app/feed" replace />;
  return children;
}

function RedirectIfAuthed({ children }) {
  const { session, loading } = useAuth();
  if (loading) return null;
  if (session) return <Navigate to="/app/feed" replace />;
  return children;
}

export default function App() {
  const { session, loading, ready, profile } = useAuth();
  const [introDone, setIntroDone] = useState(false);
  const doneRef = useRef(false);
  const [maintenance, setMaintenance] = useState(null);
  const maintenanceRef = useRef(null);
  maintenanceRef.current = maintenance;

  // Maintenance flag comes from /api/status; while it is ON we keep polling
  // so the page recovers by itself as soon as the org flips it back.
  useEffect(() => {
    let alive = true;
    let timer;
    const check = async () => {
      try {
        const res = await fetch('/api/status');
        if (!res.ok) return;
        const j = await res.json();
        if (alive) setMaintenance(j.maintenance || { enabled: false });
      } catch {
        /* offline / API unreachable — show the app normally */
      }
    };
    check();
    timer = setInterval(() => {
      if (maintenanceRef.current?.enabled || maintenance === null) check();
    }, 30_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  // Everyone is blocked by maintenance — except super admins, who still get
  // the full app (and the toggle in Root access) so they can verify fixes.
  let maintenanceBlocked = false;
  if (maintenance?.enabled) {
    if (!session) maintenanceBlocked = true;
    else if (!loading && profile?.role !== 'superadmin') maintenanceBlocked = true;
  }

  useEffect(() => {
    if (doneRef.current) return;
    const seen = sessionStorage.getItem('codex_intro');
    const wait = seen ? 0 : 2400;
    const t = setTimeout(() => {
      doneRef.current = true;
      sessionStorage.setItem('codex_intro', '1');
      setIntroDone(true);
    }, wait);
    return () => clearTimeout(t);
  }, []);

  return (
    <>
      {!introDone && <LoadingScreen />}
      {maintenanceBlocked && <MaintenancePage message={maintenance.message} />}
      {!maintenanceBlocked && !ready && <ConfigGate />}
      {!maintenanceBlocked && (
        <Routes>
        <Route path="/" element={introDone ? <Navigate to="/welcome" replace /> : null} />
        <Route path="/welcome" element={<RedirectIfAuthed><Welcome /></RedirectIfAuthed>} />
        <Route path="/about" element={<Lazy><About /></Lazy>} />
        <Route path="/auth" element={<RedirectIfAuthed><Auth /></RedirectIfAuthed>} />
        <Route
          path="/app"
          element={
            <RequireAuth>
              <AppShell />
            </RequireAuth>
          }
        >
          <Route index element={<Navigate to="/app/feed" replace />} />
          <Route path="feed" element={<Feed />} />
          <Route path="profile/:id" element={<Lazy><Profile /></Lazy>} />
          <Route path="events" element={<Events />} />
          <Route path="events/:id" element={<Lazy><EventDetail /></Lazy>} />
          <Route path="idcard" element={<Lazy><MyId /></Lazy>} />
          <Route path="leaderboard" element={<Lazy><Leaderboard /></Lazy>} />
          <Route path="certificates" element={<Lazy><Certificates /></Lazy>} />
          <Route path="elections" element={<Lazy><Elections /></Lazy>} />
          <Route
            path="directory"
            element={
              <RequireRole roles={['moderator', 'admin', 'superadmin', 'adviser']}>
                <Lazy><Directory /></Lazy>
              </RequireRole>
            }
          />
          <Route path="settings" element={<Lazy><ProfileSettings /></Lazy>} />
          <Route path="about" element={<Lazy><About /></Lazy>} />
          <Route path="scanner/:eventId" element={<Lazy><ScannerPage /></Lazy>} />
          <Route
            path="admin"
            element={
              <RequireRole roles={['admin', 'superadmin']}>
                <Lazy><Admin /></Lazy>
              </RequireRole>
            }
          />
          <Route
            path="adviser"
            element={
              <RequireRole roles={['adviser', 'admin', 'superadmin']}>
                <Lazy><Adviser /></Lazy>
              </RequireRole>
            }
          />
          <Route
            path="superadmin"
            element={
              <RequireRole roles={['superadmin']}>
                <Lazy><SuperAdmin /></Lazy>
              </RequireRole>
            }
          />
        </Route>
        <Route path="*" element={<Navigate to="/welcome" replace />} />
        </Routes>
      )}
      {!maintenanceBlocked && session && !loading && <ChatAssistant />}
    </>
  );
}
