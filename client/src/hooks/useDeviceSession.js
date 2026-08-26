// Single-device session tracking hook
// Enforces one active session per user by tracking device ID

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { getDeviceId } from '../lib/deviceFingerprint';

export function useDeviceSession() {
  const { profile, session, refreshProfile } = useAuth();
  const [deviceConflict, setDeviceConflict] = useState(false);
  const [currentDeviceId, setCurrentDeviceId] = useState(null);

  // Register this device for the current user
  const registerDevice = useCallback(async () => {
    if (!profile || !session) return;
    
    try {
      const deviceId = await getDeviceId();
      setCurrentDeviceId(deviceId);
      
      // Store device info in profile metadata (using position field or a new column)
      // We'll use a custom approach: store device info in localStorage for now
      // and check on auth state changes
      
      const storedDeviceId = localStorage.getItem('codex_registered_device_id');
      if (storedDeviceId && storedDeviceId !== deviceId) {
        // Different device detected - conflict!
        setDeviceConflict(true);
        return false;
      }
      
      // Register this device
      localStorage.setItem('codex_registered_device_id', deviceId);
      localStorage.setItem('codex_device_registered_at', Date.now().toString());
      
      // Also sync to profile if we add a device_id column later
      return true;
    } catch (err) {
      console.error('Device registration failed:', err);
      return false;
    }
  }, [profile, session]);

  // Check for device conflict on auth state change
  useEffect(() => {
    if (session && profile) {
      registerDevice();
    } else if (!session) {
      // Clear conflict on logout
      setDeviceConflict(false);
      setCurrentDeviceId(null);
    }
  }, [session, profile, registerDevice]);

  // Force logout from all other devices (admin action)
  const forceLogoutOtherDevices = useCallback(async () => {
    if (!profile) return;
    
    try {
      // This would require a backend function to invalidate other sessions
      // For now, we just register current device as the only valid one
      const deviceId = await getDeviceId();
      localStorage.setItem('codex_registered_device_id', await getDeviceId());
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
  const { currentDeviceId } = useDeviceSession();

  useEffect(() => {
    if (!session || !profile) return;

    const validateSession = async () => {
      try {
        // Check if our device ID matches the registered one
        const currentId = localStorage.getItem('codex_registered_device_id');
        const deviceId = await getDeviceId();
        
        if (currentId && currentId !== deviceId) {
          // Another device has logged in - force logout
          console.warn('Session conflict detected - another device logged in');
          logout();
        }
      } catch (err) {
        console.error('Session validation failed:', err);
      }
    };

    // Validate on mount and periodically
    validateSession();
    const interval = setInterval(validateSession, 60000); // Check every minute
    
    return () => clearInterval(interval);
  }, [session, profile]);
}