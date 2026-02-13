"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactNode, useEffect, useRef, useState } from "react";

import { AuthProvider, useAuth } from "@/lib/auth/client";
import {
  getOfflineSyncSnapshot,
  setOfflineTokenProvider,
  startOfflineSync,
  subscribeOfflineSync,
  triggerOfflineReplay
} from "@/lib/offline/queue";

function OfflineSyncBridge({ queryClient }: { queryClient: QueryClient }) {
  const { getIdToken, user } = useAuth();
  const lastSyncRef = useRef<string | null>(null);

  useEffect(() => {
    setOfflineTokenProvider(getIdToken);
    startOfflineSync();
    void triggerOfflineReplay();
    return () => {
      setOfflineTokenProvider(null);
    };
  }, [getIdToken, user?.uid]);

  useEffect(() => {
    const unsubscribe = subscribeOfflineSync(() => {
      const snapshot = getOfflineSyncSnapshot();
      if (!snapshot.lastSyncAt || snapshot.lastSyncAt === lastSyncRef.current) {
        return;
      }
      lastSyncRef.current = snapshot.lastSyncAt;
      void queryClient.invalidateQueries();
    });
    return unsubscribe;
  }, [queryClient]);

  return null;
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: 1
          }
        }
      })
  );

  return (
    <AuthProvider>
      <QueryClientProvider client={queryClient}>
        <OfflineSyncBridge queryClient={queryClient} />
        {children}
      </QueryClientProvider>
    </AuthProvider>
  );
}
