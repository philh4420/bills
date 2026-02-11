"use client";

import { useEffect } from "react";

function shouldEnablePwa() {
  if (typeof window === "undefined") {
    return false;
  }

  if (process.env.NODE_ENV === "production") {
    return true;
  }

  return process.env.NEXT_PUBLIC_ENABLE_PWA_DEV === "true";
}

export function PwaRegister() {
  useEffect(() => {
    if (!shouldEnablePwa() || !("serviceWorker" in navigator)) {
      return;
    }

    void navigator.serviceWorker.register("/sw.js", { scope: "/" });
  }, []);

  return null;
}
