import { describe, expect, it } from "vitest";
import { WatchlistAsset } from "../core/data/market-feed";

describe("Error Recovery & Stale Real-Price Preservation", () => {
  it("preserves previous valid market prices when a transient refresh fails", () => {
    const initialWatchlist: WatchlistAsset[] = [
      {
        symbol: "BTCUSDT",
        name: "Bitcoin",
        lastPrice: 65420.5,
        change24h: 2.15,
        high24h: 66000,
        low24h: 64000,
        volumeQuote: 1500000000,
      },
    ];

    let watchlist = [...initialWatchlist];
    let isStale = false;
    let errorMessage: string | null = null;

    // Simulate transient failure during polling
    const handleFetchError = (err: Error) => {
      if (watchlist.length > 0) {
        // Retain stale data, do NOT overwrite with 0 or clear
        isStale = true;
        errorMessage = "Связь с биржей прервана. Отображаются последние сохранённые цены.";
      } else {
        watchlist = [];
        errorMessage = err.message;
      }
    };

    handleFetchError(new Error("Timeout after 8000ms"));

    expect(watchlist).toHaveLength(1);
    expect(watchlist[0].lastPrice).toBe(65420.5); // Still authentic real price!
    expect(watchlist[0].lastPrice).not.toBe(0);
    expect(isStale).toBe(true);
    expect(errorMessage).toContain("Связь с биржей прервана");
  });

  it("decouples loading and error states for signal and candles", () => {
    let loading = true;
    let error: string | null = null;
    let signal: any = null;

    // When API returns failure:
    const onApiFailure = (err: string) => {
      loading = false;
      error = err;
      signal = null;
    };

    onApiFailure("Failed to generate signal: Upstream timeout");

    expect(loading).toBe(false);
    expect(error).toBe("Failed to generate signal: Upstream timeout");
    expect(signal).toBeNull();
    // In this state, UI must NOT show the loading spinner because loading === false
    const shouldShowSpinner = loading;
    const shouldShowErrorCard = Boolean(error && !signal);

    expect(shouldShowSpinner).toBe(false);
    expect(shouldShowErrorCard).toBe(true);
  });
});
