import { NextRequest } from "next/server";
import { Receiver } from "@upstash/qstash";

export interface CronAuthResult {
  authorized: boolean;
  reason?: string;
  method?: "cron_secret" | "forwarded_secret" | "url_key" | "qstash_signature" | "dev_bypass";
}

/**
 * Resilient multi-provider cron authenticator.
 * Supports:
 * 1. Standard CRON_SECRET via "Authorization: Bearer <token>" (Vercel Cron, GitHub Actions, cron-job.org, curl).
 * 2. Forwarded secret via "Upstash-Forward-Authorization: Bearer <token>" (Upstash QStash custom header).
 * 3. URL query parameter "?key=<token>" (convenience for webhooks / monitoring).
 * 4. Upstash QStash cryptographic signature verification via "Upstash-Signature" header
 *    when QSTASH_CURRENT_SIGNING_KEY and QSTASH_NEXT_SIGNING_KEY are configured.
 */
export async function verifyCronAuthorization(request: NextRequest): Promise<CronAuthResult> {
  const cronSecret = process.env.CRON_SECRET;
  const qstashCurrentKey = process.env.QSTASH_CURRENT_SIGNING_KEY;
  const qstashNextKey = process.env.QSTASH_NEXT_SIGNING_KEY;

  // 1. Check standard Authorization header
  const authHeader = request.headers.get("authorization");
  if (cronSecret && authHeader) {
    if (authHeader === `Bearer ${cronSecret}`) {
      return { authorized: true, method: "cron_secret" };
    }
  }

  // 2. Check Upstash QStash forwarded authorization header
  const forwardedAuth = request.headers.get("upstash-forward-authorization");
  if (cronSecret && forwardedAuth) {
    if (forwardedAuth === `Bearer ${cronSecret}`) {
      return { authorized: true, method: "forwarded_secret" };
    }
  }

  // 3. Check query param ?key=...
  const urlKey = request.nextUrl.searchParams.get("key");
  if (cronSecret && urlKey) {
    if (urlKey === cronSecret) {
      return { authorized: true, method: "url_key" };
    }
  }

  // 4. Check QStash signature verification if QStash signing keys are present
  const qstashSignature = request.headers.get("upstash-signature");
  if (qstashSignature && qstashCurrentKey && qstashNextKey) {
    try {
      const receiver = new Receiver({
        currentSigningKey: qstashCurrentKey,
        nextSigningKey: qstashNextKey,
      });

      // Clone request body to verify raw body
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
      console.warn("[CronAuth] QStash signature verification failed:", err?.message || err);
    }
  }

  // 5. If no secrets are configured in development environment, allow bypass with warning
  const isProd = process.env.NODE_ENV === "production" || process.env.VERCEL === "1";
  if (!cronSecret && !qstashCurrentKey && !isProd) {
    return { authorized: true, method: "dev_bypass" };
  }

  return {
    authorized: false,
    reason: "Unauthorized: Missing or invalid CRON_SECRET or QStash signature",
  };
}
