"use client";

import {
  AuthError,
  browserLocalPersistence,
  getRedirectResult,
  GoogleAuthProvider,
  User,
  setPersistence,
  signInWithPopup,
  signInWithRedirect,
  signOut as firebaseSignOut,
  onAuthStateChanged
} from "firebase/auth";
import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from "react";

import { getFirebaseClientAuth } from "@/lib/firebase/client";

const OWNER_DENIED_MESSAGE =
  "This is a private single-user site. Your Google account is not allowed to access it.";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  ownerLoading: boolean;
  isOwner: boolean;
  authError: string | null;
  ownerError: string | null;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  getIdToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [ownerLoading, setOwnerLoading] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [ownerError, setOwnerError] = useState<string | null>(null);

  useEffect(() => {
    const auth = getFirebaseClientAuth();
    let mounted = true;

    const unsub = onAuthStateChanged(auth, (nextUser) => {
      if (!mounted) {
        return;
      }
      setUser(nextUser);
      setLoading(false);
    });

    (async () => {
      try {
        await setPersistence(auth, browserLocalPersistence);
        await getRedirectResult(auth);
      } catch (error) {
        if (!mounted) {
          return;
        }
        const message = error instanceof Error ? error.message : "Authentication redirect failed";
        setAuthError(message);
      }
    })();

    return () => {
      mounted = false;
      unsub();
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    async function verifyOwner() {
      if (!user) {
        if (!mounted) {
          return;
        }
        setOwnerLoading(false);
        setIsOwner(false);
        return;
      }

      setOwnerLoading(true);

      try {
        const token = await user.getIdToken();
        const response = await fetch("/api/me", {
          headers: { authorization: `Bearer ${token}` }
        });

        if (response.ok) {
          if (!mounted) {
            return;
          }
          setIsOwner(true);
          setOwnerError(null);
          return;
        }

        let message = `Owner verification failed (${response.status})`;
        const contentType = response.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
          const body = (await response.json()) as { error?: string };
          if (body?.error) {
            message = body.error;
          }
        }

        if (response.status === 401 || response.status === 403) {
          if (mounted) {
            setIsOwner(false);
            setOwnerError(OWNER_DENIED_MESSAGE);
          }
          await firebaseSignOut(getFirebaseClientAuth());
          return;
        }

        if (mounted) {
          setIsOwner(false);
          setOwnerError(message);
        }
      } catch (error) {
        if (!mounted) {
          return;
        }
        setIsOwner(false);
        setOwnerError(error instanceof Error ? error.message : "Owner verification failed");
      } finally {
        if (mounted) {
          setOwnerLoading(false);
        }
      }
    }

    void verifyOwner();

    return () => {
      mounted = false;
    };
  }, [user]);

  const signInWithGoogle = useCallback(async () => {
    const auth = getFirebaseClientAuth();
    const provider = new GoogleAuthProvider();
    setAuthError(null);
    setOwnerError(null);
    await setPersistence(auth, browserLocalPersistence);

    try {
      await signInWithPopup(auth, provider);
      return;
    } catch (error) {
      const authError = error as AuthError;
      const popupFallbackCodes = new Set([
        "auth/popup-blocked",
        "auth/cancelled-popup-request",
        "auth/operation-not-supported-in-this-environment"
      ]);

      if (popupFallbackCodes.has(authError.code)) {
        await signInWithRedirect(auth, provider);
        return;
      }

      throw error;
    }
  }, []);

  const signOut = useCallback(async () => {
    setOwnerError(null);
    await firebaseSignOut(getFirebaseClientAuth());
  }, []);

  const getIdToken = useCallback(async () => {
    if (!user) {
      return null;
    }
    return user.getIdToken();
  }, [user]);

  const value = useMemo(
    () => ({
      user,
      loading,
      ownerLoading,
      isOwner,
      authError,
      ownerError,
      signInWithGoogle,
      signOut,
      getIdToken
    }),
    [user, loading, ownerLoading, isOwner, authError, ownerError, signInWithGoogle, signOut, getIdToken]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return ctx;
}
