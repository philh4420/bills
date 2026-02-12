interface RateState {
  count: number;
  resetAt: number;
}

const inMemory = new Map<string, RateState>();

function getWindowMs(): number {
  const value = Number(process.env.RATE_LIMIT_WINDOW_MS ?? "60000");
  return Number.isFinite(value) && value > 0 ? value : 60_000;
}

function getMaxRequests(): number {
  const value = Number(process.env.RATE_LIMIT_MAX_REQUESTS ?? "20");
  return Number.isFinite(value) && value > 0 ? value : 20;
}

export function checkRateLimit(key: string): { ok: boolean; remaining: number; resetAt: number } {
  const windowMs = getWindowMs();
  const maxRequests = getMaxRequests();
  const now = Date.now();

  const current = inMemory.get(key);
  if (!current || current.resetAt <= now) {
    inMemory.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: maxRequests - 1, resetAt: now + windowMs };
  }

  if (current.count >= maxRequests) {
    return { ok: false, remaining: 0, resetAt: current.resetAt };
  }

  current.count += 1;
  inMemory.set(key, current);
  return { ok: true, remaining: maxRequests - current.count, resetAt: current.resetAt };
}
