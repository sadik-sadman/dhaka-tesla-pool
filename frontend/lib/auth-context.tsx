"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "./api";
import { AuthResponse, PublicUser } from "./types";

const STORAGE_KEY = "dhaka-tesla-pool.auth";

interface StoredAuth {
  token: string;
  user: PublicUser;
}

interface SignupInput {
  role: "PASSENGER" | "DRIVER";
  name: string;
  email: string;
  password: string;
  vehicleName?: string;
  vehicleCapacity?: number;
}

interface AuthContextValue {
  user: PublicUser | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<PublicUser>;
  signup: (input: SignupInput) => Promise<PublicUser>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// JWT lives in localStorage, not an httpOnly cookie -- a documented MVP
// trade-off (simple, no separate cookie/CSRF story, but readable by any
// script on the page). See docs/tech-justifications.md. Real risk if this
// shipped as-is beyond a demo: a cookie-based session would close it.
function readStoredAuth(): StoredAuth | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredAuth) : null;
  } catch {
    return null;
  }
}

function writeStoredAuth(auth: StoredAuth | null) {
  try {
    if (auth) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(auth));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // Private browsing / blocked storage -- auth just won't persist across
    // reloads, which is a degraded experience, not a broken one.
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    queueMicrotask(() => {
      const stored = readStoredAuth();
      if (stored) {
        setUser(stored.user);
        setToken(stored.token);
      }
      setLoading(false);
    });
  }, []);

  async function login(email: string, password: string) {
    const res = await apiFetch<AuthResponse>("/api/auth/login", {
      method: "POST",
      body: { email, password },
    });
    setUser(res.user);
    setToken(res.token);
    writeStoredAuth(res);
    return res.user;
  }

  async function signup(input: SignupInput) {
    const res = await apiFetch<AuthResponse>("/api/auth/signup", {
      method: "POST",
      body: input,
    });
    setUser(res.user);
    setToken(res.token);
    writeStoredAuth(res);
    return res.user;
  }

  function logout() {
    setUser(null);
    setToken(null);
    writeStoredAuth(null);
  }

  return (
    <AuthContext.Provider value={{ user, token, loading, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}

/** Redirects to /login if not authenticated once the initial auth-state
 * load has finished; returns the same shape as useAuth() for convenience. */
export function useRequireAuth(): AuthContextValue {
  const auth = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!auth.loading && !auth.user) {
      router.replace("/login");
    }
  }, [auth.loading, auth.user, router]);

  return auth;
}
