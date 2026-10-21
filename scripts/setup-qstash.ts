#!/usr/bin/env node
/**
 * CryptoPilot AI — Upstash QStash Automation Setup Script
 *
 * Configures ultra-reliable, scheduled cron invocations
 * for Model D and Breakout V2-AD Paper Trading endpoints on Vercel.
 *
 * Recommended Usage (via Environment Variables — Safe):
 *   export QSTASH_TOKEN="ey..."
 *   export CRON_SECRET="your_secret"
 *   npm run qstash:setup
 *
 * Actions:
 *   npm run qstash:setup                     # Creates/verifies schedules (default)
 *   node scripts/setup-qstash.mjs --action=list    # Read-only audit of existing schedules
 *   node scripts/setup-qstash.mjs --action=delete  # Safely deletes only CryptoPilot schedules
 */

import { Client } from "@upstash/qstash";

interface Args {
  token?: string;
  baseUrl: string;
  cronSecret?: string;
  action: "create" | "list" | "delete";
  passedSecretViaCli: boolean;
}

function parseArgs(): Args {
  const args = process.argv.slice(2);
  let token = process.env.QSTASH_TOKEN;
  let baseUrl = process.env.VERCEL_PROJECT_URL || "https://crypto-pilot-ai-beta.vercel.app";
  let cronSecret = process.env.CRON_SECRET;
  let action: "create" | "list" | "delete" = "create";
  let passedSecretViaCli = false;

  for (const arg of args) {
    if (arg.startsWith("--token=")) {
      token = arg.split("=")[1];
      passedSecretViaCli = true;
    } else if (arg.startsWith("--url=")) {
      baseUrl = arg.split("=")[1];
    } else if (arg.startsWith("--secret=")) {
      cronSecret = arg.split("=")[1];
      passedSecretViaCli = true;
    } else if (arg.startsWith("--action=")) {
      const rawAction = arg.split("=")[1]?.toLowerCase();
      if (rawAction === "list" || rawAction === "create" || rawAction === "delete") {
        action = rawAction;
      } else {
        console.warn(`[QStashSetup] Unknown action "${rawAction}". Defaulting to "create".`);
      }
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
  }

  // Ensure trailing slash removed
  baseUrl = baseUrl.replace(/\/+$/, "");

  return { token, baseUrl, cronSecret, action, passedSecretViaCli };
}

function printHelp(): void {
  console.log(`
CryptoPilot AI — QStash Scheduler Setup CLI

USAGE:
  npm run qstash:setup [options]
  node scripts/setup-qstash.mjs [options]

RECOMMENDED SAFE USAGE (Environment Variables):
  export QSTASH_TOKEN="<your_token>"
  export CRON_SECRET="<your_secret>"
  npm run qstash:setup

OPTIONS:
  --action=create     Create/verify CryptoPilot schedules (default)
  --action=list       Read-only inspection of active QStash schedules
  --action=delete     Delete only CryptoPilot AI schedules for current baseUrl
  --url=<url>         Override target Vercel URL (default: https://crypto-pilot-ai-beta.vercel.app)
  --help, -h          Show this help message

SECURITY NOTICE:
  To prevent credentials from leaking into shell history (~/.zsh_history) or
  process listings (ps aux), always prefer setting QSTASH_TOKEN and CRON_SECRET
  as environment variables rather than passing them via CLI flags.
`);
}

function maskSecret(secret?: string): string {
  if (!secret) return "(not set)";
  if (secret.length <= 8) return "********";
  return secret.slice(0, 4) + "..." + secret.slice(-4);
}

async function main(): Promise<void> {
  const { token, baseUrl, cronSecret, action, passedSecretViaCli } = parseArgs();

  console.log("==================================================");
  console.log("CRYPTOPILOT AI — UPSTASH QSTASH SCHEDULER SETUP");
  console.log("==================================================");
  console.log(`Target Base URL: ${baseUrl}`);
  console.log(`Action:          ${action.toUpperCase()}`);
  console.log(`QSTASH_TOKEN:    ${maskSecret(token)}`);
  console.log(`CRON_SECRET:     ${maskSecret(cronSecret)}`);

  if (passedSecretViaCli) {
    console.warn("\n⚠️  SECURITY WARNING: Passing secrets via CLI arguments exposes them in");
    console.warn("    process listings and shell history. Please use environment variables:");
    console.warn("    export QSTASH_TOKEN=\"...\" && export CRON_SECRET=\"...\"\n");
  }

  if (!token) {
    console.error("\n❌ Error: QSTASH_TOKEN is required.");
    console.error("Please provide it via environment variable:");
    console.error("  export QSTASH_TOKEN=\"<your_upstash_qstash_token>\"");
    console.error("  export CRON_SECRET=\"<your_cron_secret>\"");
    console.error("  npm run qstash:setup\n");
    console.error("Where to find QSTASH_TOKEN:");
    console.error("  1. Log in to https://console.upstash.com");
    console.error("  2. Select 'QStash' in the navigation menu");
    console.error("  3. Copy QSTASH_TOKEN from the dashboard\n");
    process.exit(1);
  }

  // Validate Base URL
  try {
    const parsedUrl = new URL(baseUrl);
    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      throw new Error(`Unsupported protocol: ${parsedUrl.protocol}`);
    }
  } catch (err: any) {
    console.error(`\n❌ Error: Invalid Base URL "${baseUrl}":`, err.message);
    process.exit(1);
  }

  const client = new Client({ token });

  const breakoutEndpoint = `${baseUrl}/api/cron/breakout`;
  const modelDEndpoint = `${baseUrl}/api/cron/model-d`;

  try {
    // 1. READ-ONLY: Fetch existing schedules
    console.log("\nConnecting to Upstash QStash API...");
    const schedules = await client.schedules.list();
    console.log(`Found ${schedules.length} total schedule(s) in QStash account.`);

    // 2. Action: LIST (Strictly read-only, no mutations)
    if (action === "list") {
      console.log("\n--- Active Schedules Audit ---");
      if (schedules.length === 0) {
        console.log("No schedules found.");
      } else {
        schedules.forEach((s, idx) => {
          const isCryptoPilot = s.destination === breakoutEndpoint || s.destination === modelDEndpoint;
          const tag = isCryptoPilot ? "[CryptoPilot Target]" : "[External / Other]";
          console.log(`\n${idx + 1}. ${tag}`);
          console.log(`   Schedule ID: ${s.scheduleId}`);
          console.log(`   Destination: ${s.destination}`);
          console.log(`   Cron:        "${s.cron}"`);
          console.log(`   Retries:     ${s.retries ?? "default"}`);
          if (s.createdAt) console.log(`   Created:     ${new Date(s.createdAt).toISOString()}`);
        });
      }
      console.log("\n✓ Read-only list completed. Zero modifications made.");
      return;
    }

    // 3. Action: DELETE (Strictly targeting ONLY current project endpoints)
    if (action === "delete") {
      console.log(`\nSearching for schedules strictly matching current project endpoints...`);
      const targetSchedules = schedules.filter(
        (s) => s.destination === breakoutEndpoint || s.destination === modelDEndpoint
      );

      if (targetSchedules.length === 0) {
        console.log("No matching CryptoPilot schedules found to delete.");
        return;
      }

      for (const s of targetSchedules) {
        await client.schedules.delete(s.scheduleId);
        console.log(`  ✓ Safely deleted schedule ${s.scheduleId} (${s.destination})`);
      }
      console.log("✓ All matching CryptoPilot AI schedules deleted cleanly.");
      console.log("  Other/external schedules in your Upstash account were untouched.");
      return;
    }

    // 4. Action: CREATE / CONFIGURE
    console.log("\nPreparing schedule configuration...");

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (cronSecret) {
      headers["Authorization"] = `Bearer ${cronSecret}`;
      console.log("  ✓ Attached Bearer CRON_SECRET authorization header");
    } else {
      console.warn("  ⚠️ Warning: No CRON_SECRET set. Protected endpoints will reject requests with 401.");
      console.warn("    To attach authorization: export CRON_SECRET=\"...\"");
    }

    // Task definitions
    const desiredSchedules = [
      {
        name: "Breakout V2-AD Paper Trading",
        destination: breakoutEndpoint,
        cron: "*/10 * * * *",
        retries: 3,
      },
      {
        name: "Model D Paper Trading",
        destination: modelDEndpoint,
        cron: "*/10 * * * *",
        retries: 3,
      },
    ];

    for (const task of desiredSchedules) {
      // Find existing schedules targeting STRICTLY this destination
      const existing = schedules.filter((s) => s.destination === task.destination);

      for (const oldSched of existing) {
        console.log(`  Removing duplicate/existing schedule ${oldSched.scheduleId} for ${task.destination}...`);
        await client.schedules.delete(oldSched.scheduleId);
      }

      console.log(`\nCreating Schedule: ${task.name}...`);
      const created = await client.schedules.create({
        destination: task.destination,
        cron: task.cron,
        method: "GET",
        headers,
        retries: task.retries,
      });

      console.log(`  ✓ Created schedule ${created.scheduleId}`);
      console.log(`    Target:  ${task.destination}`);
      console.log(`    Cron:    "${task.cron}" (every 10 minutes)`);
      console.log(`    Retries: ${task.retries} attempts with exponential backoff`);
    }

    console.log("\n==================================================");
    console.log("✅ QSTASH SCHEDULING CONFIGURED SUCCESSFULLY!");
    console.log("==================================================");
    console.log("Both strategies are now scheduled for autonomous execution.");
    console.log("Dashboard URL: https://console.upstash.com/qstash\n");
  } catch (err: any) {
    console.error("\n❌ QStash Setup failed:", err.message || err);
    if (err.status === 401 || err.statusCode === 401) {
      console.error("Authentication failed: QSTASH_TOKEN appears to be invalid or expired.");
    }
    process.exit(1);
  }
}

main();
