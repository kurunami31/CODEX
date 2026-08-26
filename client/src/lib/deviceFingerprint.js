// Device fingerprinting for single-device session enforcement
// Generates a consistent fingerprint based on browser/device characteristics

export async function getDeviceFingerprint() {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
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
}

// Generate a session ID for this browser session
export function getSessionId() {
  let sessionId = sessionStorage.getItem('codex_session_id');
  if (!sessionId) {
    sessionId = 'sess_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 9);
    sessionStorage.setItem('codex_session_id', sessionId);
  }
  return sessionId;
}

// Get or create a persistent device ID
export async function getDeviceId() {
  let deviceId = localStorage.getItem('codex_device_id');
  if (!deviceId) {
    const fp = await getDeviceFingerprint();
    deviceId = 'dev_' + fp + '_' + Date.now().toString(36);
    localStorage.setItem('codex_device_id', deviceId);
  }
  return deviceId;
}