import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { setAuthTokenGetter } from '@workspace/api-client-react';

export type UserRole = 'demo' | 'registered';

export interface AuthUser {
  id: string;
  username: string;
  role: UserRole;
  maxFileSizeBytes: number;
  maxFileSizeLabel: string;
}

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string) => Promise<void>;
  startDemo: () => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const STORAGE_KEY = 'rightscan_user_session';
const TOKEN_KEY = 'rcs_token';

// Immediately configure auth token getter synchronously at module initialization
if (typeof window !== 'undefined') {
  try {
    const sessionSaved = sessionStorage.getItem(STORAGE_KEY);
    const localSaved = localStorage.getItem(STORAGE_KEY);
    const saved = sessionSaved || localSaved;
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed?.id) {
        setAuthTokenGetter(() => parsed.id);
        localStorage.setItem(TOKEN_KEY, parsed.id);
      }
    }
  } catch {}
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => {
    try {
      const sessionSaved = sessionStorage.getItem(STORAGE_KEY);
      const localSaved = localStorage.getItem(STORAGE_KEY);
      const saved = sessionSaved || localSaved;
      const parsed = saved ? JSON.parse(saved) : null;
      if (parsed?.id) {
        setAuthTokenGetter(() => parsed.id);
      }
      return parsed;
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(false);

  // Sync user state with appropriate storage (sessionStorage for demo, localStorage for registered)
  useEffect(() => {
    if (user) {
      if (user.role === 'demo') {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(user));
        sessionStorage.setItem(TOKEN_KEY, user.id);
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(TOKEN_KEY);
      } else {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
        localStorage.setItem(TOKEN_KEY, user.id);
        sessionStorage.removeItem(STORAGE_KEY);
        sessionStorage.removeItem(TOKEN_KEY);
      }
      setAuthTokenGetter(() => user.id);
    } else {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(TOKEN_KEY);
      sessionStorage.removeItem(STORAGE_KEY);
      sessionStorage.removeItem(TOKEN_KEY);
      setAuthTokenGetter(() => null);
    }
  }, [user]);

  // Teardown demo session when the browser tab or window closes
  useEffect(() => {
    if (!user || user.role !== 'demo' || !user.id) return;
    const currentDemoId = user.id;

    const handleBeforeUnload = () => {
      const cleanupUrl = `/api/auth/demo/cleanup?userId=${encodeURIComponent(currentDemoId)}`;
      if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
        navigator.sendBeacon(cleanupUrl);
      } else {
        fetch(cleanupUrl, {
          method: 'POST',
          keepalive: true,
        }).catch(() => {});
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [user?.id, user?.role]);

  const login = async (username: string, password: string) => {
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Login failed');
      }
      if (data.user?.id) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data.user));
        localStorage.setItem(TOKEN_KEY, data.user.id);
        setAuthTokenGetter(() => data.user.id);
      }
      setUser(data.user);
    } finally {
      setLoading(false);
    }
  };

  const register = async (username: string, password: string) => {
    setLoading(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Registration failed');
      }
      if (data.user?.id) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data.user));
        localStorage.setItem(TOKEN_KEY, data.user.id);
        setAuthTokenGetter(() => data.user.id);
      }
      setUser(data.user);
    } finally {
      setLoading(false);
    }
  };

  const startDemo = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/auth/demo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to start demo');
      }
      if (data.user?.id) {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data.user));
        sessionStorage.setItem(TOKEN_KEY, data.user.id);
        setAuthTokenGetter(() => data.user.id);
      }
      setUser(data.user);
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    const currentUser = user;
    if (currentUser?.role === 'demo' && currentUser.id) {
      // Asynchronously purge all demo projects, assets, and Cloudinary files on the server
      fetch(`/api/auth/demo/cleanup?userId=${encodeURIComponent(currentUser.id)}`, {
        method: 'POST',
      }).catch(() => {});
    }

    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
    setAuthTokenGetter(() => null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, startDemo, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
