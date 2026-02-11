const CACHE_NAME = "bills-app-v1";
const APP_SHELL = ["/", "/login", "/dashboard", "/cards", "/bills", "/purchases", "/import", "/manifest.webmanifest", "/favicon.ico"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .catch(() => undefined)
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const clone = response.clone();
          void caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return response;
        })
        .catch(async () => (await caches.match(request)) || (await caches.match("/dashboard")) || (await caches.match("/")))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) {
        return cached;
      }

      return fetch(request).then((response) => {
        const contentType = response.headers.get("content-type") || "";
        const canCache =
          response.ok &&
          (url.pathname.startsWith("/_next/static/") ||
            url.pathname.startsWith("/icons/") ||
            url.pathname.endsWith(".css") ||
            url.pathname.endsWith(".js") ||
            url.pathname.endsWith(".svg") ||
            url.pathname.endsWith(".png") ||
            url.pathname.endsWith(".ico") ||
            url.pathname.endsWith(".webmanifest") ||
            contentType.includes("font/"));

        if (canCache) {
          const clone = response.clone();
          void caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }

        return response;
      });
    })
  );
});

self.addEventListener("push", (event) => {
  const data = (() => {
    if (!event.data) {
      return {};
    }

    try {
      return event.data.json();
    } catch {
      return { body: event.data.text() };
    }
  })();

  const title = data.title || "Bills App reminder";
  const body = data.body || "You have an upcoming card payment due.";
  const url = data.url || "/cards";
  const tag = data.tag || "bills-reminder";
  const countCandidate = Number(data.badgeCount);
  const badgeCount = Number.isFinite(countCandidate) ? Math.max(0, Math.floor(countCandidate)) : null;
  const notificationOptions = {
    body,
    tag,
    renotify: true,
    icon: "/icons/192",
    badge: "/icons/192",
    data: { url },
    // Supported on Chromium/Android. Other platforms ignore this safely.
    vibrate: [200, 100, 200]
  };

  event.waitUntil(
    (async () => {
      await self.registration.showNotification(title, notificationOptions);

      // Best-effort app icon badge updates for installed PWAs.
      if ("setAppBadge" in self.registration) {
        try {
          if (badgeCount === null) {
            await self.registration.setAppBadge(1);
          } else if (badgeCount > 0) {
            await self.registration.setAppBadge(badgeCount);
          } else if ("clearAppBadge" in self.registration) {
            await self.registration.clearAppBadge();
          }
        } catch {
          // Ignore badge update failures.
        }
      }
    })()
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification?.data?.url || "/cards";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((client) => {
        try {
          const url = new URL(client.url);
          return url.pathname === targetUrl;
        } catch {
          return false;
        }
      });

      if (existing) {
        return existing.focus();
      }

      return self.clients.openWindow(targetUrl);
    })
  );
});

self.addEventListener("message", (event) => {
  if (!event.data || event.data.type !== "CLEAR_BADGE") {
    return;
  }

  if (!("clearAppBadge" in self.registration)) {
    return;
  }

  event.waitUntil(
    (async () => {
      try {
        await self.registration.clearAppBadge();
      } catch {
        // Ignore clear badge failures.
      }
    })()
  );
});
