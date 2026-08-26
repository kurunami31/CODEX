// Device fingerprinting for single-device session enforcement
// Generates a consistent fingerprint based on browser/device characteristics

export async function getDeviceFingerprint() {
  // Guard against SSR or early execution before DOM is ready
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    return 'ssr_fallback_' + Math.random().toString(36).slice(2);
  }
  
  try {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return 'no_ctx_' + Math.random().toString(36).slice(2);
    
    ctx.textBaseline = 'top';
    ctx.font = '14px Arial';
    ctx.fillText('Device fingerprint', 2, 2);
    const canvasFp = canvas.toDataURL();

    const nav = navigator;
    const screen = window.screen;
    
    const components = [
      nav.userAgent,
      nav.language,
      nav.platform,
      nav.hardwareConcurrency || 'unknown',
      nav.deviceMemory || 'unknown',
      screen.width + 'x' + screen.height,
      screen.colorDepth,
      screen.pixelDepth,
      Intl.DateTimeFormat().resolvedOptions().timeZone,
      canvasFp.slice(0, 100),
    ];

    // Create a hash from components
    let hash = 0;
    const str = components.join('|');
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    
    return Math.abs(hash).toString(36);
  } catch (e) {
    console.warn('Device fingerprinting failed:', e);
    return 'error_fallback_' + Math.random().toString(36).slice(2);
  }
}

// Generate a session ID for this browser session
export function getSessionId() {
  if (typeof sessionStorage === 'undefined') return 'no_storage_' + Date.now().toString(36);
  
  let sessionId = sessionStorage.getItem('codex_session_id');
  if (!sessionId) {
    sessionId = 'sess_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 9);
    try { sessionStorage.setItem('codex_session_id', sessionId); } catch {}
  }
  return sessionId;
}

// Get or create a persistent device ID
export async function getDeviceId() {
  if (typeof localStorage === 'undefined') return 'no_storage_' + Date.now().toString(36);
  
  let deviceId = localStorage.getItem('codex_device_id');
  if (!deviceId) {
    const fp = await getDeviceFingerprint();
    deviceId = 'dev_' + fp + '_' + Date.now().toString(36);
    try { localStorage.setItem('codex_device_id', deviceId); } catch {}
  }
  return deviceId;
}