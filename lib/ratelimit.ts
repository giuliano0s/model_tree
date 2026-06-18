// Gatekeeper: rate-limit por IP, com contadores no Upstash Redis.
// Dois limitadores nomeados sobre o mesmo Redis (prefixos distintos):
//   - searchLimiter:    folgado (só consome requests do Vector)
//   - recommendLimiter: apertado (consome Vector + tokens do Gemini)

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const redis = Redis.fromEnv();

export const searchLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(20, "60 s"),
  prefix: "rl:search",
});

export const recommendLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, "60 s"),
  prefix: "rl:recommend",
});

// extrai o IP do cliente a partir dos headers de proxy da Vercel
export function clientIp(headers: Record<string, string | string[] | undefined>): string {
  const fwd = headers["x-forwarded-for"];
  const raw = Array.isArray(fwd) ? fwd[0] : fwd;
  return raw?.split(",")[0]?.trim() || "anon";
}
