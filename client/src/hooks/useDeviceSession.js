// Single-device session tracking hook
// Enforces one active session per user by tracking device ID

import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { getDeviceId } from '../lib/deviceFingerprint';

export function useDeviceSession() {
  const { profile, session } = useAuth();
  const [deviceConflict, setDeviceConflict] = useState(false);
  const [currentDeviceId, setCurrentDeviceId] = useState(null);
  const mountedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Register this device for the current user
  const registerDevice = useCallback(async () => {
    if (!mountedRef.current) return false;
    if (!profile || !session) return;
    
    try {
      const deviceId = await getDeviceId();
      setCurrentDeviceId(deviceId);
      
      const storedDeviceId = localStorage.getItem('codex_registered_device_id');
      if (storedDeviceId && storedDeviceId !== deviceId) {
        setDeviceConflict(true);
        return false;
      }
      
      localStorage.setItem('codex_registered_device_id', deviceId);
      localStorage.setItem('codex_device_registered_at', Date.now().toString());
      
      return true;
    } catch (err) {
      console.error('Device registration failed:', err);
      return false;
    }
  }, [profile, session]);

  // Check for device conflict on auth state change
  useEffect(() => {
    if (!mountedRef.current) return;
    if (session && profile) {
      registerDevice();
    } else if (!session) {
      setDeviceConflict(false);
      setCurrentDeviceId(null);
    }
  }, [session, profile, registerDevice]);

  // Force logout from all other devices (admin action)
  const forceLogoutOtherDevices = useCallback(async () => {
    if (!profile) return;
    
    try {
      const deviceId = await getDeviceId();
      localStorage.setItem('codex_registered_device_id', deviceId);
      localStorage.setItem('codex_device_registered_at', Date.now().toString());
      return true;
    } catch (err) {
      console.error('Force logout failed:', err);
      return false;
    }
  }, [profile]);

  return { deviceConflict, currentDeviceId, forceLogoutOtherDevices };
}

// Hook to validate session on each request
export function useSessionValidator() {
  const { session, logout, profile } = useAuth();
  const mountedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (!mountedRef.current) return;
    if (!session || !profile) return;

    let mounted = true;
    let intervalId = null;

    const validateSession = async () => {
      if (!mounted) return;
      try {
        const currentId = localStorage.getItem('codex_registered_device_id');
        const { getDeviceId } = await import('../lib/deviceFingerprint');
        const deviceId = await getDeviceId();
        
        if (currentId && currentId !== deviceId) {
          console.warn('Session conflict detected - another device logged in');
          logout();
        }
      } catch (err) {
        console.error('Session validation failed:', err);
      }
    };

    if (mounted) {
      validateSession();
      intervalId = setInterval(validateSession, 60000);
    }
    
    return () => {
      mounted = false;
      if (intervalId) clearInterval(intervalId);
    };
  }, [session, profile, logout]);
}