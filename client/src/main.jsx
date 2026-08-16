import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { ThemeProvider } from './context/ThemeContext';
import { FontScaleProvider } from './context/FontScaleContext';
import './styles/index.css';

// iOS Safari ignores user-scalable=no / maximum-scale in the viewport
// meta, so pages can still be pinched. Block the two-finger gesture at
// the touch-event level instead — single-finger scrolling is untouched.
document.addEventListener(
  'touchmove',
  (e) => {
    if (e.touches.length > 1) e.preventDefault();
  },
  { passive: false }
);
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('gesturechange', (e) => e.preventDefault());
document.addEventListener('gestureend', (e) => e.preventDefault());

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <FontScaleProvider>
          <ToastProvider>
            <AuthProvider>
              <App />
            </AuthProvider>
          </ToastProvider>
        </FontScaleProvider>
      </ThemeProvider>
    </BrowserRouter>
  </React.StrictMode>
);

// Service worker — registered here (not by the plugin) so iOS gets
// updateViaCache: 'none': Safari otherwise serves the stale sw.js from
// its HTTP cache, never picking up new precache manifests and keeping
// the old app shell alive (which white-screens after deployments).
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' });
  });
}
