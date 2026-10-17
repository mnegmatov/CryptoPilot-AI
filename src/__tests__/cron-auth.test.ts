import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { verifyCronAuthorization } from "@/core/security/cron-auth";

describe("Cron Authentication & Multi-Provider Verification Suite", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it("1. Rejects request when CRON_SECRET is configured but no auth headers/params are provided", async () => {
    process.env.CRON_SECRET = "test-secret-123";
    process.env.NODE_ENV = "production";

    const req = new NextRequest("https://example.com/api/cron/breakout");
    const result = await verifyCronAuthorization(req);

    expect(result.authorized).toBe(false);
    expect(result.reason).toContain("Unauthorized");
  });

  it("2. Rejects request when incorrect Bearer token is provided", async () => {
    process.env.CRON_SECRET = "test-secret-123";
    process.env.NODE_ENV = "production";

    const req = new NextRequest("https://example.com/api/cron/breakout", {
      headers: {
        authorization: "Bearer wrong-secret",
      },
    });
    const result = await verifyCronAuthorization(req);

    expect(result.authorized).toBe(false);
  });

  it("3. Authorizes standard 'Authorization: Bearer <CRON_SECRET>' header", async () => {
    process.env.CRON_SECRET = "test-secret-123";
    process.env.NODE_ENV = "production";

    const req = new NextRequest("https://example.com/api/cron/breakout", {
      headers: {
        authorization: "Bearer test-secret-123",
      },
    });
    const result = await verifyCronAuthorization(req);

    expect(result.authorized).toBe(true);
    expect(result.method).toBe("cron_secret");
  });

  it("4. Authorizes Upstash QStash 'Upstash-Forward-Authorization' header", async () => {
    process.env.CRON_SECRET = "test-secret-123";
    process.env.NODE_ENV = "production";

    const req = new NextRequest("https://example.com/api/cron/breakout", {
      headers: {
        "upstash-forward-authorization": "Bearer test-secret-123",
      },
    });
    const result = await verifyCronAuthorization(req);

    expect(result.authorized).toBe(true);
    expect(result.method).toBe("forwarded_secret");
  });

  it("5. Authorizes query parameter '?key=<CRON_SECRET>'", async () => {
    process.env.CRON_SECRET = "test-secret-123";
    process.env.NODE_ENV = "production";

    const req = new NextRequest("https://example.com/api/cron/breakout?key=test-secret-123");
    const result = await verifyCronAuthorization(req);

    expect(result.authorized).toBe(true);
    expect(result.method).toBe("url_key");
  });

  it("6. In development environment with no secret configured, allows dev_bypass", async () => {
    delete process.env.CRON_SECRET;
    delete process.env.QSTASH_CURRENT_SIGNING_KEY;
    delete process.env.VERCEL;
    process.env.NODE_ENV = "development";

    const req = new NextRequest("http://localhost:3000/api/cron/breakout");
    const result = await verifyCronAuthorization(req);

    expect(result.authorized).toBe(true);
    expect(result.method).toBe("dev_bypass");
  });

  it("7. In production environment with no secret configured, strictly rejects", async () => {
    delete process.env.CRON_SECRET;
    delete process.env.QSTASH_CURRENT_SIGNING_KEY;
    process.env.NODE_ENV = "production";

    const req = new NextRequest("https://example.com/api/cron/breakout");
    const result = await verifyCronAuthorization(req);

    expect(result.authorized).toBe(false);
  });
});
