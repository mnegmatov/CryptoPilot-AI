#!/usr/bin/env tsx
/**
 * CryptoPilot AI — Upstash QStash Automation Setup Script
 *
 * Configures ultra-reliable, sub-second scheduled cron invocations
 * for Model D and Breakout V2-AD Paper Trading endpoints on Vercel.
 *
 * Usage:
 *   npx tsx scripts/setup-qstash.ts --token=<QSTASH_TOKEN> [--url=<VERCEL_URL>] [--secret=<CRON_SECRET>]
 *   npm run qstash:setup -- --token=<QSTASH_TOKEN>
 */

import { Client } from "@upstash/qstash";

interface Args {
  token?: string;
  baseUrl: string;
  cronSecret?: string;
  action: "create" | "list" | "delete";
}

function parseArgs(): Args {
  const args = process.argv.slice(2);
  let token = process.env.QSTASH_TOKEN;
  let baseUrl = process.env.VERCEL_PROJECT_URL || "https://crypto-pilot-ai-beta.vercel.app";
  let cronSecret = process.env.CRON_SECRET;
  let action: "create" | "list" | "delete" = "create";

  for (const arg of args) {
    if (arg.startsWith("--token=")) {
      token = arg.split("=")[1];
    } else if (arg.startsWith("--url=")) {
      baseUrl = arg.split("=")[1];
    } else if (arg.startsWith("--secret=")) {
      cronSecret = arg.split("=")[1];
    } else if (arg.startsWith("--action=")) {
      action = arg.split("=")[1] as any;
    }
  }

  // Ensure trailing slash removed
  baseUrl = baseUrl.replace(/\/$/, "");

  return { token, baseUrl, cronSecret, action };
}

async function main() {
  const { token, baseUrl, cronSecret, action } = parseArgs();

  console.log("==================================================");
  console.log("CRYPTOPILOT AI — UPSTASH QSTASH SCHEDULER SETUP");
  console.log("==================================================");
  console.log(`Target Base URL: ${baseUrl}`);
  console.log(`Action:          ${action.toUpperCase()}`);

  if (!token) {
    console.error("\n❌ Error: QSTASH_TOKEN is required.");
    console.error("Please provide it via environment variable or command line argument:");
    console.error("  npx tsx scripts/setup-qstash.ts --token=ey... [--secret=mySecret]\n");
    console.error("Where to find QSTASH_TOKEN:");
    console.error("  1. Log in to https://console.upstash.com");
    console.error("  2. Select 'QStash' in the top navigation");
    console.error("  3. Copy your QSTASH_TOKEN from the dashboard\n");
    process.exit(1);
  }

  const client = new Client({ token });

  const breakoutEndpoint = `${baseUrl}/api/cron/breakout`;
  const modelDEndpoint = `${baseUrl}/api/cron/model-d`;

  try {
    // 1. List existing schedules
    console.log("\nFetching active QStash schedules...");
    const schedules = await client.schedules.list();
    console.log(`Found ${schedules.length} existing schedule(s).`);

    for (const s of schedules) {
      console.log(`  - [ID: ${s.scheduleId}] -> ${s.destination} (cron: "${s.cron}")`);
    }

    if (action === "list") {
      return;
    }

    if (action === "delete") {
      console.log("\nDeleting CryptoPilot AI schedules...");
      for (const s of schedules) {
        if (s.destination.includes("/api/cron/breakout") || s.destination.includes("/api/cron/model-d")) {
          await client.schedules.delete(s.scheduleId);
          console.log(`  ✓ Deleted schedule ${s.scheduleId} (${s.destination})`);
        }
      }
      console.log("All matching schedules deleted.");
      return;
    }

    // 2. Action: Create / Reconfigure
    console.log("\nConfiguring automated 10-minute schedules...");

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (cronSecret) {
      headers["Authorization"] = `Bearer ${cronSecret}`;
      console.log("  ✓ Attached Bearer CRON_SECRET authorization header");
    } else {
      console.warn("  ⚠️ Warning: No CRON_SECRET specified. If endpoints are protected, specify --secret=<token>.");
    }

    // Remove any existing schedules targeting the exact same endpoints to avoid duplicates
    for (const s of schedules) {
      if (s.destination === breakoutEndpoint || s.destination === modelDEndpoint) {
        console.log(`  Removing existing schedule ${s.scheduleId} to prevent duplication...`);
        await client.schedules.delete(s.scheduleId);
      }
    }

    // Schedule Breakout V2-AD: every 10 minutes (*/10 * * * *)
    console.log(`\nCreating Schedule 1: Breakout Paper Trading...`);
    const breakoutSched = await client.schedules.create({
      destination: breakoutEndpoint,
      cron: "*/10 * * * *",
      method: "GET",
      headers,
      retries: 3,
    });
    console.log(`  ✓ Breakout Schedule created! Schedule ID: ${breakoutSched.scheduleId}`);
    console.log(`    Target: ${breakoutEndpoint}`);
    console.log(`    Cron:   */10 * * * * (Every 10 minutes, exactly on the 10m boundary)`);

    // Schedule Model D: every 10 minutes (offset by 1 minute: 1-59/10 * * * * or synchronized)
    console.log(`\nCreating Schedule 2: Model D Paper Trading...`);
    const modelDSched = await client.schedules.create({
      destination: modelDEndpoint,
      cron: "*/10 * * * *",
      method: "GET",
      headers,
      retries: 3,
    });
    console.log(`  ✓ Model D Schedule created! Schedule ID: ${modelDSched.scheduleId}`);
    console.log(`    Target: ${modelDEndpoint}`);
    console.log(`    Cron:   */10 * * * * (Every 10 minutes, exactly on the 10m boundary)`);

    console.log("\n==================================================");
    console.log("✅ QSTASH SCHEDULING CONFIGURED SUCCESSFULLY!");
    console.log("==================================================");
    console.log("Both strategies will now execute autonomously with second-level accuracy.");
    console.log("You can monitor incoming jobs live in Upstash Console:");
    console.log("  https://console.upstash.com/qstash\n");
  } catch (err: any) {
    console.error("\n❌ QStash Setup failed:", err?.message || err);
    process.exit(1);
  }
}

main();
