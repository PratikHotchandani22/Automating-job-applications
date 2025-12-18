/**
 * Authentication Context for React Dashboard
 * Provides auth state and methods throughout the app
 */

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import {
  supabase,
  isSupabaseConfigured,
  getSession,
  signInWithEmail as supabaseSignInWithEmail,
  signInWithGoogle as supabaseSignInWithGoogle,
  signOut as supabaseSignOut,
  onAuthStateChange,
} from '../lib/supabase';
import type { User, Session } from '@supabase/supabase-js';

interface AuthContextType {
  // State
  user: User | null;
  session: Session | null;
  loading: boolean;
  isAuthenticated: boolean;
  isConfigured: boolean;
  
  // Methods
  signInWithEmail: (email: string) => Promise<{ error: Error | null }>;
  signInWithGoogle: () => Promise<{ error: Error | null }>;
  signOut: () => Promise<{ error: Error | null }>;
  refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  // Initialize auth state
  useEffect(() => {
    let mounted = true;
    let initialized = false;

    const initAuth = async () => {
      if (initialized) return;
      initialized = true;
      
      try {
        console.log('[Auth] Initializing...');
        const currentSession = await getSession();
        console.log('[Auth] Session loaded:', currentSession ? 'yes' : 'no');
        if (mounted) {
          setSession(currentSession);
          setUser(currentSession?.user || null);
        }
      } catch (error) {
        console.error('[Auth] Initialization error:', error);
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    initAuth();

    // Listen for auth changes
    const unsubscribe = onAuthStateChange((event, newSession) => {
      if (!mounted) return;
      
      console.log('[Auth] State changed:', event);
      setSession(newSession);
      setUser(newSession?.user || null);
      setLoading(false); // Ensure loading is false after any auth change
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  const signInWithEmail = useCallback(async (email: string) => {
    setLoading(true);
    try {
      return await supabaseSignInWithEmail(email);
    } finally {
      setLoading(false);
    }
  }, []);

  const signInWithGoogle = useCallback(async () => {
    setLoading(true);
    try {
      return await supabaseSignInWithGoogle();
    } finally {
      // Don't set loading to false here - OAuth will redirect
    }
  }, []);

  const signOut = useCallback(async () => {
    setLoading(true);
    try {
      const result = await supabaseSignOut();
      if (!result.error) {
        setUser(null);
        setSession(null);
      }
      return result;
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshSession = useCallback(async () => {
    try {
      const { data: { session: refreshedSession } } = await supabase.auth.refreshSession();
      setSession(refreshedSession);
      setUser(refreshedSession?.user || null);
    } catch (error) {
      console.error('Session refresh error:', error);
    }
  }, []);

  const value: AuthContextType = {
    user,
    session,
    loading,
    isAuthenticated: Boolean(user),
    isConfigured: isSupabaseConfigured,
    signInWithEmail,
    signInWithGoogle,
    signOut,
    refreshSession,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

/**
 * Hook to access auth context
 */
export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

/**
 * Hook to get current access token
 */
export function useAccessToken(): string | null {
  const { session } = useAuth();
  return session?.access_token || null;
}

export default AuthContext;
