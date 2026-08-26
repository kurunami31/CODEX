import { useEffect } from 'react';
import { useInactivityLogout } from '../hooks/useInactivityLogout';
import { useDeviceSession, useSessionValidator } from '../hooks/useDeviceSession';

/**
 * Security initializer - renders as child of AuthProvider so useAuth() works.
 * Initializes all security hooks after the auth context is available.
 */
export function SecurityInitializer({ children }) {
  useInactivityLogout();
  useDeviceSession();
  useSessionValidator();
  return children;
}