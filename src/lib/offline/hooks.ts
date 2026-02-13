"use client";

import { useSyncExternalStore } from "react";

import { getOfflineSyncSnapshot, subscribeOfflineSync } from "@/lib/offline/queue";

export function useOfflineSyncStatus() {
  return useSyncExternalStore(subscribeOfflineSync, getOfflineSyncSnapshot, getOfflineSyncSnapshot);
}

