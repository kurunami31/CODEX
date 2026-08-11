import { useEffect, useRef, useState, lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import LoadingScreen from './pages/LoadingScreen';
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
const Admin = lazy(() => import('./pages/Admin'));

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

function RequireRole({ role, children }) {
  const { profile, loading } = useAuth();
  if (loading || !profile) return null;
  if (profile.role !== role) return <Navigate to="/app/feed" replace />;
  return children;
}

function RedirectIfAuthed({ children }) {
  const { session, loading } = useAuth();
  if (loading) return null;
  if (session) return <Navigate to="/app/feed" replace />;
  return children;
}

export default function App() {
  const { session, loading, ready } = useAuth();
  const [introDone, setIntroDone] = useState(false);
  const doneRef = useRef(false);

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
      {!ready && <ConfigGate />}
      <Routes>
        <Route path="/" element={introDone ? <Navigate to="/welcome" replace /> : null} />
        <Route path="/welcome" element={<RedirectIfAuthed><Welcome /></RedirectIfAuthed>} />
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
          <Route path="settings" element={<Lazy><ProfileSettings /></Lazy>} />
          <Route path="scanner/:eventId" element={<Lazy><ScannerPage /></Lazy>} />
          <Route
            path="admin"
            element={
              <RequireRole role="admin">
                <Lazy><Admin /></Lazy>
              </RequireRole>
            }
          />
        </Route>
        <Route path="*" element={<Navigate to="/welcome" replace />} />
      </Routes>
      {session && !loading && <ChatAssistant />}
    </>
  );
}
