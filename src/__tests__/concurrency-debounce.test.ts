import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { BreakoutPaperService } from "@/core/breakout-paper/service";
import { BreakoutStorageService, createInitialBreakoutAccount } from "@/core/breakout-paper/storage";
import { PAPER_STORAGE_KEY, PAPER_LOCK_KEY } from "@/core/paper/storage";
import { BREAKOUT_STORAGE_KEY, BREAKOUT_LOCK_KEY } from "@/core/breakout-paper/storage";

describe("Concurrency, Debounce Guard & System Isolation Suite", () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("1. Verifies absolute isolation between Model D and Breakout Redis keys and locks", () => {
    expect(PAPER_STORAGE_KEY).not.toBe(BREAKOUT_STORAGE_KEY);
    expect(PAPER_LOCK_KEY).not.toBe(BREAKOUT_LOCK_KEY);
    expect(PAPER_STORAGE_KEY).toBe("cryptopilot:paper:v1");
    expect(BREAKOUT_STORAGE_KEY).toBe("cryptopilot:paper:breakout:v1");
    expect(PAPER_LOCK_KEY).toBe("cryptopilot:paper:lock");
    expect(BREAKOUT_LOCK_KEY).toBe("cryptopilot:paper:breakout:lock");
  });

  it("2. Debounce Guard allows immediate retry if previous cycle failed before state mutation", async () => {
    const account = createInitialBreakoutAccount();
    const baseNow = 1700000100000;

    const dateSpy = vi.spyOn(Date, "now");
    // Account was last successfully updated 120s ago (> 60s debounce threshold)
    dateSpy.mockReturnValueOnce(baseNow - 120000);
    await BreakoutStorageService.saveAccount(account);

    dateSpy.mockReturnValue(baseNow);

    // Mock Binance failure during first cycle attempt
    vi.spyOn(BreakoutPaperService, "fetchRealCandles").mockRejectedValueOnce(
      new Error("Binance 503 Service Unavailable")
    );

    // Attempt cycle — should throw and not update account.lastUpdated
    await expect(BreakoutPaperService.executeCycle()).rejects.toThrow("Binance 503");

    // The account was NOT updated with baseNow because cycle failed
    const reloadedAccount = await BreakoutStorageService.loadAccount();
    expect(reloadedAccount.positions).toHaveLength(0);
    expect(reloadedAccount.lastUpdated).toBe(baseNow - 120000);
  });

  it("3. Rapid sequential calls without custom data are cleanly debounced", async () => {
    const account = createInitialBreakoutAccount();
    const baseNow = 1700000020000;

    const dateSpy = vi.spyOn(Date, "now");
    dateSpy.mockReturnValueOnce(baseNow - 15000); // 15s ago
    await BreakoutStorageService.saveAccount(account);

    dateSpy.mockReturnValue(baseNow);

    const report = await BreakoutPaperService.executeCycle();
    expect(report.skipped).toBe(true);
    expect(report.skipReason).toContain("already executed");
    expect(report.closedTradesThisCycle).toHaveLength(0);
    expect(report.openedPositionsThisCycle).toHaveLength(0);
  });
});
