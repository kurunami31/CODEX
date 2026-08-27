// Activity tracking hook for 5-minute inactivity auto-logout
// Tracks user activity and triggers logout after 5 minutes of inactivity

import { useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';

const INACTIVITY_TIMEOUT = 5 * 60 * 1000; // 5 minutes in milliseconds
const ACTIVITY_EVENTS = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];

// Emails to exclude from inactivity timeout (superadmin accounts)
const EXCLUDED_EMAILS = ['dms.prime3101@gmail.com'];

export function useInactivityLogout() {
  const { logout, session, profile } = useAuth();
  const timeoutRef = useRef(null);
  const isLoggingOut = useRef(false);
  const mountedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Check if current user should be excluded from inactivity timeout
  const isExcluded = useCallback(() => {
    if (!profile?.email) return false;
    return EXCLUDED_EMAILS.includes(profile.email.toLowerCase());
  }, [profile?.email]);

  const resetTimer = useCallback(() => {
    if (!mountedRef.current) return;
    if (isLoggingOut.current || !session) return;
    // Skip timer for excluded users
    if (isExcluded()) return;
    
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    
    timeoutRef.current = setTimeout(() => {
      if (!mountedRef.current) return;
      isLoggingOut.current = true;
      logout();
    }, INACTIVITY_TIMEOUT);
  }, [logout, session, isExcluded]);

  const handleActivity = useCallback(() => {
    if (mountedRef.current) resetTimer();
  }, [resetTimer]);

  useEffect(() => {
    if (!mountedRef.current) return;
    
    if (!session) {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      return;
    }

    // Skip inactivity timeout for excluded users
    if (isExcluded()) return;

    // Initial timer
    resetTimer();

    // Add event listeners
    ACTIVITY_EVENTS.forEach(event => {
      document.addEventListener(event, handleActivity, { passive: true });
    });

    // Cleanup
    return () => {
      ACTIVITY_EVENTS.forEach(event => {
        document.removeEventListener(event, handleActivity);
      });
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [session, handleActivity, resetTimer, isExcluded]);

  // Expose manual reset for cases like manual navigation
  return { resetTimer };
}