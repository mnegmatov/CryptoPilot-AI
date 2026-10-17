import { NextRequest } from "next/server";
import { Receiver } from "@upstash/qstash";
import crypto from "crypto";

export interface CronAuthResult {
  authorized: boolean;
  reason?: string;
  method?: "cron_secret" | "forwarded_secret" | "url_key" | "qstash_signature" | "dev_bypass";
}

/**
 * Constant-time string comparison to prevent timing attacks
 */
function safeCompare(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

/**
 * Production-hardened multi-provider cron authenticator.
 *
 * Security Invariants:
 * 1. In production, unauthenticated requests are strictly forbidden.
 * 2. In production, query parameter authentication (?key=) is completely disabled to prevent
 *    accidental secret leakage in browser history, proxy access logs, and CDN edge traces.
 * 3. Constant-time comparison is enforced for all secret tokens.
 * 4. QStash signatures (HMAC-SHA256) are cryptographically validated using official Upstash Receiver.
 * 5. Neither CRON_SECRET nor signing keys are ever echoed or logged.
 */
export async function verifyCronAuthorization(request: NextRequest): Promise<CronAuthResult> {
  const cronSecret = process.env.CRON_SECRET;
  const qstashCurrentKey = process.env.QSTASH_CURRENT_SIGNING_KEY;
  const qstashNextKey = process.env.QSTASH_NEXT_SIGNING_KEY;
  const isProd = process.env.NODE_ENV === "production" || process.env.VERCEL === "1";

  // 1. Check standard Authorization header: "Bearer <CRON_SECRET>"
  const authHeader = request.headers.get("authorization");
  if (cronSecret && authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7).trim();
    if (safeCompare(token, cronSecret)) {
      return { authorized: true, method: "cron_secret" };
    }
  }

  // 2. Check Upstash QStash forwarded authorization header
  const forwardedAuth = request.headers.get("upstash-forward-authorization");
  if (cronSecret && forwardedAuth && forwardedAuth.startsWith("Bearer ")) {
    const token = forwardedAuth.slice(7).trim();
    if (safeCompare(token, cronSecret)) {
      return { authorized: true, method: "forwarded_secret" };
    }
  }

  // 3. Check cryptographic QStash signature if signing keys are configured
  const qstashSignature = request.headers.get("upstash-signature");
  if (qstashSignature && qstashCurrentKey && qstashNextKey) {
    try {
      const receiver = new Receiver({
        currentSigningKey: qstashCurrentKey,
        nextSigningKey: qstashNextKey,
      });

      const rawBody = await request.clone().text().catch(() => "");
      const isValid = await receiver.verify({
        signature: qstashSignature,
        body: rawBody,
        url: request.url,
      });

      if (isValid) {
        return { authorized: true, method: "qstash_signature" };
      }
    } catch (err: any) {
      console.warn("[CronAuth] Cryptographic QStash signature verification failed:", err?.message || err);
    }
  }

  // 4. Query parameter (?key=) is strictly restricted to development environments only
  if (!isProd && cronSecret) {
    const urlKey = request.nextUrl.searchParams.get("key");
    if (urlKey && safeCompare(urlKey, cronSecret)) {
      return { authorized: true, method: "url_key" };
    }
  }

  // 5. In local dev environment with zero secrets configured, allow developer bypass
  if (!cronSecret && !qstashCurrentKey && !isProd) {
    return { authorized: true, method: "dev_bypass" };
  }

  return {
    authorized: false,
    reason: "Unauthorized: Missing or invalid authorization token or cryptographic signature",
  };
}
