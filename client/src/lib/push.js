import { supabase } from './supabase';

const SW_PATH = '/push-sw.js';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export async function pushInfo() {
  try {
    const res = await fetch('/api/push/key');
    if (!res.ok) return { enabled: false, key: null };
    const j = await res.json();
    return { enabled: Boolean(j.enabled), key: j.key || null };
  } catch {
    return { enabled: false, key: null };
  }
}

export function isSupported() {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window;
}

async function getRegistration() {
  return navigator.serviceWorker.register(SW_PATH);
}

// Returns true if the device subscribed and we stored it.
export async function enablePush(userId) {
  if (!isSupported() || !userId) return { ok: false, reason: 'unsupported' };
  const info = await pushInfo();
  if (!info.enabled || !info.key) return { ok: false, reason: 'not-configured' };

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return { ok: false, reason: 'denied' };

  const reg = await getRegistration();
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(info.key),
    });
  }

  const { error } = await supabase.from('push_subscriptions').insert({
    user_id: userId,
    endpoint: sub.endpoint,
    keys: sub.toJSON().keys || {},
  });
  if (error) return { ok: false, reason: error.message };
  return { ok: true };
}

export async function disablePush() {
  if (!isSupported()) return;
  try {
    const reg = await navigator.serviceWorker.getRegistration(SW_PATH);
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      const { error } = await supabase
        .from('push_subscriptions')
        .delete()
        .eq('endpoint', sub.endpoint);
      if (!error) await sub.unsubscribe();
    }
  } catch {
    /* best-effort */
  }
}

// Quick status: is a subscription stored for the current device?
export async function hasLocalSubscription() {
  if (!isSupported()) return false;
  try {
    const reg = await navigator.serviceWorker.getRegistration(SW_PATH);
    const sub = await reg?.pushManager.getSubscription();
    return Boolean(sub);
  } catch {
    return false;
  }
}