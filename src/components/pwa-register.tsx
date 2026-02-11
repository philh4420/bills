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

    const clearBadges = async () => {
      try {
        if ("clearAppBadge" in navigator) {
          await navigator.clearAppBadge();
        }
      } catch {
        // Ignore client badge clear failures.
      }

      try {
        const registration = await navigator.serviceWorker.getRegistration();
        registration?.active?.postMessage({ type: "CLEAR_BADGE" });
      } catch {
        // Ignore SW badge clear failures.
      }
    };

    void navigator.serviceWorker.register("/sw.js", { scope: "/" }).then(() => clearBadges());

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void clearBadges();
      }
    };

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, []);

  return null;
}
