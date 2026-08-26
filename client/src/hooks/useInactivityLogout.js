// Activity tracking hook for 5-minute inactivity auto-logout
// Tracks user activity and triggers logout after 5 minutes of inactivity

import { useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';

const INACTIVITY_TIMEOUT = 5 * 60 * 1000; // 5 minutes in milliseconds
const ACTIVITY_EVENTS = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];

export function useInactivityLogout() {
  const { logout, session } = useAuth();
  const timeoutRef = useRef(null);
  const isLoggingOut = useRef(false);

  const resetTimer = useCallback(() => {
    if (isLoggingOut.current || !session) return;
    
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    
    timeoutRef.current = setTimeout(() => {
      isLoggingOut.current = true;
      logout();
    }, INACTIVITY_TIMEOUT);
  }, [logout, session]);

  const handleActivity = useCallback(() => {
    resetTimer();
  }, [resetTimer]);

  useEffect(() => {
    if (!session) {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      return;
    }

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
  }, [session, handleActivity, resetTimer]);

  // Expose manual reset for cases like manual navigation
  return { resetTimer };
}